<script>
  import { onMount } from 'svelte';
  
  const { ipcRenderer } = require('electron');

  export let onClose = () => {};
  export let onSave = () => {};

  // State
  let soundtrackData = { tracks: [], options: { randomOnNoMatch: false } };
  let editingTrackIndex = null;
  let editingTrack = null;
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

  onMount(async () => {
    await loadSoundtrackData();
  });

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
      
      // Reset form
      newTrackName = '';
      newTrackUrl = '';
      newTrackMatches = [];
      matchInputValue = '';
      errorMessage = '';
    } catch (err) {
      // Error already handled in getYouTubeTitle
    }
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
      soundtrackData.tracks.splice(index, 1);
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
        editingTrack.matches.push(matchObj);
      } else {
        newTrackMatches.push(matchObj);
      }
    }

    matchInputValue = '';
    autocompleteSuggestions = [];
    showAutocomplete = false;
  }

  function removeMatch(trackIndex, matchIndex) {
    if (trackIndex === editingTrackIndex && editingTrack) {
      editingTrack.matches.splice(matchIndex, 1);
    } else {
      soundtrackData.tracks[trackIndex].matches.splice(matchIndex, 1);
    }
  }

  function getMatchDisplay(match) {
    if (match.name) return `Name: ${match.name}`;
    if (match.tag) return `Tag: ${match.tag}`;
    if (match.area_type_tag) return `Area Type: ${match.area_type_tag}`;
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
  class="fixed inset-0 z-50 bg-d2-button border-4 border-d2-button-border p-6 overflow-y-auto"
  role="dialog"
  aria-modal="true"
  aria-labelledby="editor-title"
>
  <!-- Modal Header -->
  <div class="flex items-center justify-between mb-4">
    <h2 id="editor-title" class="text-2xl font-bold">Edit Soundtrack</h2>
    <button
      on:click={onClose}
      class="p-1 hover:bg-d2-button-hover rounded transition-colors"
      title="Close"
    >
      <i class="material-icons text-d2-text">close</i>
    </button>
  </div>

  {#if errorMessage}
    <div class="mb-4 p-2 bg-red-900/50 border border-red-500 text-red-200 text-sm">
      {errorMessage}
    </div>
  {/if}

  <!-- Tracks List -->
  <div class="mb-6">
    <h3 class="text-xl font-bold mb-2">Tracks ({soundtrackData.tracks.length})</h3>
    <div class="space-y-2 max-h-64 overflow-y-auto">
      {#each soundtrackData.tracks as track, index}
        <div class="bg-d2-button-hover/50 p-3 rounded border border-d2-button-border">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <div class="font-bold text-base">{track.name}</div>
              <div class="text-sm text-d2-text/80 truncate" title={track.location}>{track.location}</div>
              <div class="text-xs text-d2-text/60 mt-1">
                {track.matches.length} match{track.matches.length !== 1 ? 'es' : ''}
              </div>
            </div>
            <div class="flex gap-2 ml-2">
              <button
                on:click={() => startEditTrack(index)}
                class="d2button btn-secondary text-xs"
                disabled={editingTrackIndex !== null && editingTrackIndex !== index}
              >
                Edit
              </button>
              <button
                on:click={() => deleteTrack(index)}
                class="d2button text-xs"
                disabled={editingTrackIndex === index}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="text-d2-text/60 text-center py-4">No tracks yet. Add one below.</div>
      {/each}
    </div>
  </div>

  <!-- Add/Edit Track Form -->
  <div class="mb-6">
    <h3 class="text-xl font-bold mb-2">
      {editingTrackIndex !== null ? 'Edit Track' : 'Add New Track'}
    </h3>
    
    {#if editingTrackIndex !== null}
      <!-- Edit Track -->
      <div class="space-y-3 bg-d2-button-hover/30 p-4 rounded border border-d2-button-border">
        <div>
          <label class="block text-sm mb-1">Track Name</label>
          <input
            type="text"
            bind:value={editingTrack.name}
            class="w-full bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
            placeholder="Track name"
          />
        </div>
        <div>
          <label class="block text-sm mb-1">YouTube URL</label>
          <input
            type="text"
            bind:value={editingTrack.location}
            class="w-full bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>
        <div>
          <label class="block text-sm mb-1">Matches</label>
          <div class="space-y-2">
            {#each editingTrack.matches as match, matchIndex}
              <div class="flex items-center justify-between bg-d2-button p-2 rounded">
                <span class="text-sm">{getMatchDisplay(match)}</span>
                <button
                  on:click={() => removeMatch(editingTrackIndex, matchIndex)}
                  class="text-red-400 hover:text-red-300 text-sm"
                  title="Remove match"
                >
                  <i class="material-icons text-base">delete</i>
                </button>
              </div>
            {/each}
            <!-- Match Input for Editing -->
            <div class="autocomplete-container relative">
              <div class="flex gap-2 mb-2">
                <select
                  bind:value={matchSearchType}
                  class="bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text text-sm"
                >
                  <option value="name">Name</option>
                  <option value="tag">Tag</option>
                  <option value="area_type_tag">Area Type</option>
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
                  class="flex-1 bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
                  placeholder="Search and add match..."
                />
              </div>
              {#if showAutocomplete && autocompleteSuggestions.length > 0}
                <div class="absolute z-10 w-full bg-d2-button border border-d2-button-border max-h-48 overflow-y-auto">
                  {#each autocompleteSuggestions as suggestion}
                    <button
                      on:click={() => selectAutocompleteSuggestion(suggestion)}
                      class="w-full text-left px-2 py-1 hover:bg-d2-button-hover text-sm"
                    >
                      {suggestion.value}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            on:click={saveEditTrack}
            class="d2button btn-primary"
            disabled={loadingYouTube || saving}
          >
            Save Changes
          </button>
          <button
            on:click={cancelEditTrack}
            class="d2button btn-secondary"
            disabled={loadingYouTube || saving}
          >
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <!-- Add Track -->
      <div class="space-y-3 bg-d2-button-hover/30 p-4 rounded border border-d2-button-border">
        <div>
          <label class="block text-sm mb-1">YouTube URL {#if loadingYouTube}(Loading...){/if}</label>
          <input
            type="text"
            bind:value={newTrackUrl}
            class="w-full bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={loadingYouTube}
          />
        </div>
        <div>
          <label class="block text-sm mb-1">Track Name (optional, will use YouTube title if empty)</label>
          <input
            type="text"
            bind:value={newTrackName}
            class="w-full bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
            placeholder="Track name"
            disabled={loadingYouTube}
          />
        </div>
        <div>
          <label class="block text-sm mb-1">Matches</label>
          <div class="space-y-2">
            {#each newTrackMatches as match, matchIndex}
              <div class="flex items-center justify-between bg-d2-button p-2 rounded">
                <span class="text-sm">{getMatchDisplay(match)}</span>
                <button
                  on:click={() => newTrackMatches.splice(matchIndex, 1)}
                  class="text-red-400 hover:text-red-300 text-sm"
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
                  class="bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text text-sm"
                >
                  <option value="name">Name</option>
                  <option value="tag">Tag</option>
                  <option value="area_type_tag">Area Type</option>
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
                  class="flex-1 bg-d2-button border border-d2-button-border px-2 py-1 text-d2-text"
                  placeholder="Search and add match..."
                />
              </div>
              {#if showAutocomplete && autocompleteSuggestions.length > 0}
                <div class="absolute z-10 w-full bg-d2-button border border-d2-button-border max-h-48 overflow-y-auto">
                  {#each autocompleteSuggestions as suggestion}
                    <button
                      on:click={() => selectAutocompleteSuggestion(suggestion)}
                      class="w-full text-left px-2 py-1 hover:bg-d2-button-hover text-sm"
                    >
                      {suggestion.value}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
        <button
          on:click={addTrack}
          class="d2button btn-primary"
          disabled={loadingYouTube || saving || !newTrackUrl.trim()}
        >
          Add Track
        </button>
      </div>
    {/if}
  </div>

  <!-- Save Buttons -->
  <div class="flex gap-2 justify-end">
    <button
      on:click={saveSoundtrack}
      class="d2button btn-primary"
      disabled={saving || editingTrackIndex !== null}
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
    <button
      on:click={saveSoundtrackAs}
      class="d2button btn-secondary"
      disabled={saving || editingTrackIndex !== null}
    >
      {saving ? 'Saving...' : 'Save As'}
    </button>
  </div>
</div>

<style>
  .autocomplete-container {
    position: relative;
  }
</style>
