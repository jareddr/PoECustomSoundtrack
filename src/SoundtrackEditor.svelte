<script>
  import { onMount } from 'svelte';
  
  const { ipcRenderer } = require('electron');

  export let onClose = () => {};
  export let onSave = () => {};

  // State
  let soundtrackData = { tracks: [], options: { randomOnNoMatch: false } };
  let editingTrackIndex = null;
  let editingTrack = null;
  let showAddTrackModal = false;
  let matchSearchType = 'name'; // 'name', 'tag', or 'area_type_tag'
  let autocompleteSuggestions = [];
  let showAutocomplete = false;
  let loadingYouTube = false;
  let saving = false;
  let errorMessage = '';
  let currentFilePath = '';

  // Track form state
  let newTrackName = '';
  let newTrackUrl = '';
  let newTrackMatches = [];

  // Match input state
  let matchInputValue = '';
  let lastFetchedUrl = '';
  let isAutoFetching = false;

  onMount(async () => {
    await loadSoundtrackData();
  });

  // Function to check if a string is a valid YouTube URL
  function isValidYouTubeUrl(url) {
    if (!url || !url.trim()) return false;
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url.trim());
  }

  // Reactive statement to auto-fetch YouTube title when URL changes
  $: if (showAddTrackModal && newTrackUrl && !isAutoFetching) {
    const url = newTrackUrl.trim();
    // Only fetch if it's a valid YouTube URL, we haven't fetched this URL yet, and name is empty
    if (isValidYouTubeUrl(url) && url !== lastFetchedUrl && !newTrackName.trim()) {
      isAutoFetching = true;
      lastFetchedUrl = url;
      getYouTubeTitle(url)
        .then(title => {
          if (!newTrackName.trim()) { // Double-check name is still empty
            newTrackName = title;
            errorMessage = ''; // Clear any previous errors
          }
        })
        .catch(err => {
          // Error already handled in getYouTubeTitle, reset lastFetchedUrl so we can retry
          lastFetchedUrl = '';
        })
        .finally(() => {
          isAutoFetching = false;
        });
    }
  }

  async function loadSoundtrackData() {
    try {
      const result = await ipcRenderer.invoke('getSoundtrackData');
      soundtrackData = JSON.parse(JSON.stringify(result.data)); // Deep copy
      currentFilePath = result.filePath || '';
      if (!soundtrackData.options) {
        soundtrackData.options = { randomOnNoMatch: false };
      }
    } catch (err) {
      console.error('Error loading soundtrack data:', err);
      errorMessage = 'Failed to load soundtrack data';
    }
  }

  async function getYouTubeTitle(videoUrl) {
    try {
      loadingYouTube = true;
      errorMessage = '';
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
      const res = await fetch(oembedUrl);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      return data.title;
    } catch (err) {
      console.error('Error fetching YouTube title:', err);
      errorMessage = `Failed to fetch YouTube title: ${err.message}`;
      throw err;
    } finally {
      loadingYouTube = false;
    }
  }

  async function addTrack() {
    if (!newTrackUrl.trim()) {
      errorMessage = 'Please enter a YouTube URL';
      return;
    }

    try {
      const title = await getYouTubeTitle(newTrackUrl);
      const newTrack = {
        name: newTrackName.trim() || title,
        location: newTrackUrl.trim(),
        matches: [...newTrackMatches]
      };

      soundtrackData.tracks.push(newTrack);
      
      // Reset form and close modal
      newTrackName = '';
      newTrackUrl = '';
      newTrackMatches = [];
      matchInputValue = '';
      errorMessage = '';
      showAddTrackModal = false;
    } catch (err) {
      // Error already handled in getYouTubeTitle
    }
  }

  function openAddTrackModal() {
    showAddTrackModal = true;
    newTrackName = '';
    newTrackUrl = '';
    newTrackMatches = [];
    matchInputValue = '';
    errorMessage = '';
    lastFetchedUrl = '';
    isAutoFetching = false;
  }

  function closeAddTrackModal() {
    showAddTrackModal = false;
    newTrackName = '';
    newTrackUrl = '';
    newTrackMatches = [];
    matchInputValue = '';
    errorMessage = '';
    lastFetchedUrl = '';
    isAutoFetching = false;
  }

  function startEditTrack(index) {
    editingTrackIndex = index;
    const track = soundtrackData.tracks[index];
    editingTrack = {
      name: track.name,
      location: track.location,
      matches: JSON.parse(JSON.stringify(track.matches)) // Deep copy
    };
    newTrackMatches = [];
    matchInputValue = '';
  }

  function cancelEditTrack() {
    editingTrackIndex = null;
    editingTrack = null;
    newTrackMatches = [];
    matchInputValue = '';
    errorMessage = '';
  }

  function saveEditTrack() {
    if (!editingTrack) return;

    if (!editingTrack.location.trim()) {
      errorMessage = 'Please enter a YouTube URL';
      return;
    }

    soundtrackData.tracks[editingTrackIndex] = {
      name: editingTrack.name.trim(),
      location: editingTrack.location.trim(),
      matches: editingTrack.matches
    };

    cancelEditTrack();
  }

  function deleteTrack(index) {
    if (confirm('Are you sure you want to delete this track?')) {
      soundtrackData.tracks = soundtrackData.tracks.filter((_, i) => i !== index);
      if (editingTrackIndex === index) {
        cancelEditTrack();
      } else if (editingTrackIndex > index) {
        editingTrackIndex--;
      }
    }
  }

  async function autocompleteSearch(query, type) {
    if (!query || query.length < 2) {
      autocompleteSuggestions = [];
      showAutocomplete = false;
      return;
    }

    try {
      const results = await ipcRenderer.invoke('getWorldAreasData', type, query);
      autocompleteSuggestions = results;
      showAutocomplete = results.length > 0;
    } catch (err) {
      console.error('Error searching world areas:', err);
      autocompleteSuggestions = [];
      showAutocomplete = false;
    }
  }

  function handleMatchInputChange(value) {
    matchInputValue = value;
    autocompleteSearch(value, matchSearchType);
  }

  function selectAutocompleteSuggestion(suggestion) {
    const matchValue = suggestion.value;
    const matchObj = { [matchSearchType]: matchValue };

    // Check for duplicates
    const isDuplicate = editingTrackIndex !== null
      ? editingTrack.matches.some(m => JSON.stringify(m) === JSON.stringify(matchObj))
      : newTrackMatches.some(m => JSON.stringify(m) === JSON.stringify(matchObj));

    if (!isDuplicate) {
      if (editingTrackIndex !== null) {
        editingTrack.matches = [...editingTrack.matches, matchObj];
      } else if (showAddTrackModal) {
        newTrackMatches = [...newTrackMatches, matchObj];
      }
    }

    matchInputValue = '';
    autocompleteSuggestions = [];
    showAutocomplete = false;
  }

  function removeMatch(trackIndex, matchIndex) {
    if (trackIndex === editingTrackIndex && editingTrack) {
      editingTrack.matches = editingTrack.matches.filter((_, i) => i !== matchIndex);
    } else {
      soundtrackData.tracks[trackIndex].matches = soundtrackData.tracks[trackIndex].matches.filter((_, i) => i !== matchIndex);
      // Trigger reactivity by reassigning the tracks array
      soundtrackData.tracks = [...soundtrackData.tracks];
    }
  }

  function getMatchDisplay(match) {
    if (match.name) return `Name: ${match.name}`;
    if (match.tag) return `Tag: ${match.tag}`;
    if (match.area_type_tag) return `Area Type: ${match.area_type_tag}`;
    return 'Unknown';
  }

  function getMatchPillLabel(match) {
    if (match.name) return 'Area';
    if (match.tag) return 'Tag';
    if (match.area_type_tag) return 'Type';
    return 'Unknown';
  }

  function getMatchPillValue(match) {
    if (match.name) return match.name;
    if (match.tag) return match.tag;
    if (match.area_type_tag) return match.area_type_tag;
    return 'Unknown';
  }

  async function saveSoundtrack() {
    try {
      saving = true;
      errorMessage = '';
      const result = await ipcRenderer.invoke('saveSoundtrack', soundtrackData);
      if (result.success) {
        onSave();
        onClose();
      } else {
        errorMessage = result.error || 'Failed to save soundtrack';
      }
    } catch (err) {
      console.error('Error saving soundtrack:', err);
      errorMessage = err.message || 'Failed to save soundtrack';
    } finally {
      saving = false;
    }
  }

  async function saveSoundtrackAs() {
    try {
      saving = true;
      errorMessage = '';
      const result = await ipcRenderer.invoke('save-file-dialog', {
        defaultPath: currentFilePath || 'soundtrack.soundtrack'
      });

      if (result.canceled || !result.filePath) {
        saving = false;
        return;
      }

      const saveResult = await ipcRenderer.invoke('saveSoundtrackAs', soundtrackData, result.filePath);
      if (saveResult.success) {
        currentFilePath = saveResult.file;
        onSave();
        onClose();
      } else {
        errorMessage = saveResult.error || 'Failed to save soundtrack';
      }
    } catch (err) {
      console.error('Error saving soundtrack as:', err);
      errorMessage = err.message || 'Failed to save soundtrack';
    } finally {
      saving = false;
    }
  }

  function handleClickOutside(event) {
    if (!event.target.closest('.autocomplete-container')) {
      showAutocomplete = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div 
  class="h-screen flex flex-col bg-bg-100 p-6 font-sans text-text-100 overflow-hidden"
  role="main"
  aria-labelledby="editor-title"
>
  <!-- Header -->
  <div class="flex items-center mb-4 flex-shrink-0">
    <h2 id="editor-title" class="text-2xl font-exocet font-bold text-text-100">Edit Soundtrack</h2>
  </div>

  {#if errorMessage}
    <div class="mb-4 p-2 bg-primary-300 border border-primary-100 text-text-100 text-sm flex-shrink-0">
      {errorMessage}
    </div>
  {/if}

  <!-- Tracks List -->
  <div class="flex-1 flex flex-col min-h-0 mb-4">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-xl font-exocet font-bold">Tracks ({soundtrackData.tracks.length})</h3>
      <button
        on:click={openAddTrackModal}
        class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300"
        disabled={editingTrackIndex !== null || showAddTrackModal}
      >
        Add Track
      </button>
    </div>
    <div class="flex-1 overflow-y-auto overflow-x-hidden space-y-2">
      {#each soundtrackData.tracks as track, index}
        <div class="bg-bg-200 rounded border border-bg-300 min-w-0">
          <!-- Track Header (always visible) -->
          <div class="p-3">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-base truncate text-text-100" title={track.name}>{track.name}</div>
              <div class="text-sm text-text-200 truncate" title={track.location}>{track.location}</div>
              {#if track.matches.length > 0}
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each track.matches as match}
                    <span class="text-xs text-text-200/70 bg-bg-300 px-1.5 py-0.5 rounded border border-bg-300">
                      {getMatchPillLabel(match)}: {getMatchPillValue(match)}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Edit Form (expanded when editing) -->
          {#if editingTrackIndex === index && editingTrack}
            <div class="px-3 pb-3 pt-0 space-y-3 border-t border-bg-300 mt-2">
              <div>
                <label for="edit-track-name-{index}" class="block text-sm mb-1 text-text-100">Track Name</label>
                <input
                  id="edit-track-name-{index}"
                  type="text"
                  bind:value={editingTrack.name}
                  class="w-full bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
                  placeholder="Track name"
                />
              </div>
              <div>
                <label for="edit-track-url-{index}" class="block text-sm mb-1 text-text-100">YouTube URL</label>
                <input
                  id="edit-track-url-{index}"
                  type="text"
                  bind:value={editingTrack.location}
                  class="w-full bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
              <div>
                <label for="edit-track-matches-{index}" class="block text-sm mb-1 text-text-100">Matches Area</label>
                <div class="space-y-2">
                  {#each editingTrack.matches as match, matchIndex}
                    <div class="flex items-center justify-between bg-bg-300 p-2 rounded border border-bg-300">
                      <span class="text-sm text-text-100">{getMatchDisplay(match)}</span>
                      <button
                        on:click={() => removeMatch(editingTrackIndex, matchIndex)}
                        class="text-primary-100 hover:text-primary-200 text-sm"
                        title="Remove match"
                      >
                        <i class="material-icons text-base">delete</i>
                      </button>
                    </div>
                  {/each}
                  <!-- Match Input for Editing -->
                  <div id="edit-track-matches-{index}" class="autocomplete-container relative">
                    <div class="flex gap-2 mb-2">
                      <select
                        bind:value={matchSearchType}
                        class="bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 text-sm"
                        style="background-color: #353535; color: #FFFFFF;"
                      >
                        <option value="name" style="background-color: #353535; color: #FFFFFF;">Name</option>
                        <option value="tag" style="background-color: #353535; color: #FFFFFF;">Tag</option>
                        <option value="area_type_tag" style="background-color: #353535; color: #FFFFFF;">Area Type</option>
                      </select>
                      <input
                        type="text"
                        bind:value={matchInputValue}
                        on:input={(e) => handleMatchInputChange(e.target.value)}
                        on:keydown={(e) => {
                          if (e.key === 'Enter' && autocompleteSuggestions.length > 0) {
                            selectAutocompleteSuggestion(autocompleteSuggestions[0]);
                          }
                        }}
                        class="flex-1 bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
                        placeholder="Search and add match..."
                      />
                    </div>
                    {#if showAutocomplete && autocompleteSuggestions.length > 0}
                      <div class="absolute z-10 w-full bg-bg-200 border border-bg-300 max-h-48 overflow-y-auto">
                        {#each autocompleteSuggestions as suggestion}
                          <button
                            on:click={() => selectAutocompleteSuggestion(suggestion)}
                            class="w-full text-left px-2 py-1 hover:bg-bg-300 text-sm text-text-100"
                          >
                            {suggestion.value}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <!-- Action Buttons (bottom right) -->
          <div class="px-3 pb-3 pt-2 flex justify-end gap-2 border-t border-bg-300">
            {#if editingTrackIndex === index}
              <button
                on:click={saveEditTrack}
                class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300 text-xs"
                disabled={loadingYouTube || saving}
              >
                Save
              </button>
              <button
                on:click={cancelEditTrack}
                class="d2button bg-bg-300 hover:bg-bg-200 text-text-100 border-bg-300 text-xs"
                disabled={loadingYouTube || saving}
              >
                Cancel
              </button>
            {:else}
              <button
                on:click={() => startEditTrack(index)}
                class="d2button bg-bg-300 hover:bg-bg-200 text-text-100 border-bg-300 text-xs"
                disabled={editingTrackIndex !== null}
              >
                Edit
              </button>
              <button
                on:click={() => deleteTrack(index)}
                class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300 text-xs"
                disabled={editingTrackIndex !== null}
              >
                Delete
              </button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="text-text-200 text-center py-4">No tracks yet. Click "Add Track" to get started.</div>
      {/each}
    </div>
  </div>

  <!-- Save Buttons -->
  <div class="flex gap-2 justify-end flex-shrink-0">
    <button
      on:click={onClose}
      class="d2button bg-bg-300 hover:bg-bg-200 text-text-100 border-bg-300"
      disabled={saving || editingTrackIndex !== null}
    >
      Cancel
    </button>
    <button
      on:click={saveSoundtrack}
      class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300"
      disabled={saving || editingTrackIndex !== null}
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
    <button
      on:click={saveSoundtrackAs}
      class="d2button bg-bg-300 hover:bg-bg-200 text-text-100 border-bg-300"
      disabled={saving || editingTrackIndex !== null}
    >
      {saving ? 'Saving...' : 'Save As'}
    </button>
  </div>
</div>

<!-- Add Track Modal -->
{#if showAddTrackModal}
  <div 
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
    on:click={closeAddTrackModal}
    role="dialog"
    aria-modal="true"
  >
    <div 
      class="bg-bg-100 border-4 border-primary-200 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      on:click|stopPropagation
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-2xl font-exocet font-bold text-text-100">Add New Track</h3>
        <button
          on:click={closeAddTrackModal}
          class="p-1 hover:bg-bg-300 rounded transition-colors"
          title="Close"
        >
          <i class="material-icons text-text-100">close</i>
        </button>
      </div>

      {#if errorMessage}
        <div class="mb-4 p-2 bg-primary-300 border border-primary-100 text-text-100 text-sm">
          {errorMessage}
        </div>
      {/if}

      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-text-100">YouTube URL {#if loadingYouTube || isAutoFetching}(Loading...){/if}</label>
          <input
            type="text"
            bind:value={newTrackUrl}
            class="w-full bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={loadingYouTube || isAutoFetching}
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-text-100">Track Name</label>
          <input
            type="text"
            bind:value={newTrackName}
            class="w-full bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
            placeholder="Track name"
            disabled={loadingYouTube}
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-text-100">Matches Area</label>
          <div class="space-y-2">
            {#each newTrackMatches as match, matchIndex}
              <div class="flex items-center justify-between bg-bg-200 p-2 rounded border border-bg-300">
                <span class="text-sm text-text-100">{getMatchDisplay(match)}</span>
                <button
                  on:click={() => newTrackMatches = newTrackMatches.filter((_, i) => i !== matchIndex)}
                  class="text-primary-100 hover:text-primary-200 text-sm"
                  title="Remove match"
                >
                  <i class="material-icons text-base">delete</i>
                </button>
              </div>
            {/each}
            <!-- Match Input for Adding -->
            <div class="autocomplete-container relative">
              <div class="flex gap-2 mb-2">
                <select
                  bind:value={matchSearchType}
                  class="bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 text-sm"
                  style="background-color: #353535; color: #FFFFFF;"
                >
                  <option value="name" style="background-color: #353535; color: #FFFFFF;">Name</option>
                  <option value="tag" style="background-color: #353535; color: #FFFFFF;">Tag</option>
                  <option value="area_type_tag" style="background-color: #353535; color: #FFFFFF;">Area Type</option>
                </select>
                <input
                  type="text"
                  bind:value={matchInputValue}
                  on:input={(e) => handleMatchInputChange(e.target.value)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' && autocompleteSuggestions.length > 0) {
                      selectAutocompleteSuggestion(autocompleteSuggestions[0]);
                    }
                  }}
                  class="flex-1 bg-bg-300 border border-bg-300 px-2 py-1 text-text-100 placeholder:text-text-200/50"
                  placeholder="Search and add match..."
                />
              </div>
              {#if showAutocomplete && autocompleteSuggestions.length > 0}
                <div class="absolute z-10 w-full bg-bg-200 border border-bg-300 max-h-48 overflow-y-auto">
                  {#each autocompleteSuggestions as suggestion}
                    <button
                      on:click={() => selectAutocompleteSuggestion(suggestion)}
                      class="w-full text-left px-2 py-1 hover:bg-bg-300 text-sm text-text-100"
                    >
                      {suggestion.value}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button
            on:click={closeAddTrackModal}
            class="d2button bg-bg-300 hover:bg-bg-200 text-text-100 border-bg-300"
            disabled={loadingYouTube || saving}
          >
            Cancel
          </button>
          <button
            on:click={addTrack}
            class="d2button bg-primary-200 hover:bg-primary-100 text-text-100 border-primary-300"
            disabled={loadingYouTube || saving || !newTrackUrl.trim()}
          >
            Add Track
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow: hidden;
  }

  :global(html) {
    height: 100%;
  }

  :global(#app) {
    height: 100%;
  }

  .autocomplete-container {
    position: relative;
  }
</style>
