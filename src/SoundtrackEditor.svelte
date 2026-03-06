<script>
  import { onMount } from 'svelte';
  
  const { ipcRenderer } = require('electron');

  export let onClose = () => {};
  export let onSave = () => {};

  // State
  const UNLINKED_ZONE_OPTIONS = [
    { value: 'random', label: 'Play a random track' },
    { value: 'silence', label: 'Silence' },
    { value: 'keep', label: 'Keep playing active track' },
  ];
  let soundtrackData = { tracks: [], options: { unlinkedZoneBehavior: 'random' } };
  let editingTrackIndex = null;
  let editingTrack = null;
  let showAddTrackModal = false;
  let matchSearchType = 'name'; // 'name', 'tag', or 'area_type_tag'
  let autocompleteSuggestions = [];
  let showAutocomplete = false;
  let autocompleteHighlightIndex = 0;
  let loadingYouTube = false;
  let saving = false;
  let errorMessage = '';
  let currentFilePath = '';

  // Dirty tracking: snapshot of loaded/saved data for unsaved-changes detection
  let originalDataJson = '';

  // Track form state
  let newTrackName = '';
  let newTrackUrl = '';
  let newTrackMatches = [];

  // Match input state
  let matchInputValue = '';
  let lastFetchedUrl = '';
  let isAutoFetching = false;

  // Filter state
  let filterQuery = '';

  function trackMatchesFilter(track, q) {
    if (!q) return true;
    const lower = q.toLowerCase();
    if (track.name && String(track.name).toLowerCase().includes(lower)) return true;
    if (!track.matches || !Array.isArray(track.matches)) return false;
    for (const match of track.matches) {
      if (match.name && String(match.name).toLowerCase().includes(lower)) return true;
      if (match.tag && String(match.tag).toLowerCase().includes(lower)) return true;
      if (match.area_type_tag && String(match.area_type_tag).toLowerCase().includes(lower)) return true;
      if (match.boss && String(match.boss).toLowerCase().includes(lower)) return true;
    }
    return false;
  }

  $: isDirty = originalDataJson !== '' && JSON.stringify(soundtrackData) !== originalDataJson;

  $: filteredTracks = soundtrackData.tracks
    ? soundtrackData.tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => !filterQuery.trim() || trackMatchesFilter(track, filterQuery.trim()))
    : [];

  onMount(async () => {
    await loadSoundtrackData();
    ipcRenderer.on('editor-close-requested', () => {
      requestClose('window');
    });
    return () => {
      ipcRenderer.removeAllListeners('editor-close-requested');
    };
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

  function normalizeOptions(options) {
    if (!options) return;
    const valid = ['random', 'silence', 'keep'];
    if (!valid.includes(options.unlinkedZoneBehavior)) {
      options.unlinkedZoneBehavior = options.randomOnNoMatch === true ? 'random' : 'keep';
    }
  }

  async function loadSoundtrackData() {
    try {
      const result = await ipcRenderer.invoke('getSoundtrackData');
      soundtrackData = JSON.parse(JSON.stringify(result.data)); // Deep copy
      currentFilePath = result.filePath || '';
      if (!soundtrackData.options) {
        soundtrackData.options = { unlinkedZoneBehavior: 'random' };
      }
      normalizeOptions(soundtrackData.options);
      originalDataJson = JSON.stringify(soundtrackData);
    } catch (err) {
      console.error('Error loading soundtrack data:', err);
      errorMessage = 'Failed to load soundtrack data';
    }
  }

  async function loadSoundtrackFile() {
    try {
      const result = await ipcRenderer.invoke('open-file-dialog');
      if (result && !result.canceled && result.filePaths && result.filePaths[0]) {
        ipcRenderer.send('setSoundtrack', result.filePaths);
        await loadSoundtrackData();
        errorMessage = '';
      }
    } catch (err) {
      console.error('Error loading soundtrack file:', err);
      errorMessage = 'Failed to load soundtrack file';
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

      soundtrackData.tracks = [...soundtrackData.tracks, newTrack];

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

  function requestDeleteTrack(index) {
    deleteTargetIndex = index;
    showDeleteConfirm = true;
  }

  function cancelDeleteConfirm() {
    showDeleteConfirm = false;
    deleteTargetIndex = null;
  }

  function confirmDeleteTrack() {
    if (deleteTargetIndex == null) return;
    const index = deleteTargetIndex;
    soundtrackData.tracks = soundtrackData.tracks.filter((_, i) => i !== index);
    if (editingTrackIndex === index) {
      cancelEditTrack();
    } else if (editingTrackIndex > index) {
      editingTrackIndex--;
    }
    cancelDeleteConfirm();
  }

  async function autocompleteSearch(query, type) {
    try {
      const q = query == null ? '' : String(query);
      const results = await ipcRenderer.invoke('getWorldAreasData', type, q);
      autocompleteSuggestions = results;
      showAutocomplete = true;
      autocompleteHighlightIndex = results.length > 0 ? 0 : -1;
    } catch (err) {
      console.error('Error searching world areas:', err);
      autocompleteSuggestions = [];
      showAutocomplete = false;
      autocompleteHighlightIndex = -1;
    }
  }

  function handleMatchInputChange(value) {
    matchInputValue = value;
    autocompleteSearch(value, matchSearchType);
  }

  function handleAutocompleteKeydown(e) {
    if (e.key === 'Escape') {
      showAutocomplete = false;
      autocompleteSuggestions = [];
      autocompleteHighlightIndex = -1;
      e.stopPropagation();
      return;
    }
    if (e.key === 'ArrowDown' && showAutocomplete && autocompleteSuggestions.length > 0) {
      e.preventDefault();
      autocompleteHighlightIndex = Math.min(autocompleteHighlightIndex + 1, autocompleteSuggestions.length - 1);
      return;
    }
    if (e.key === 'ArrowUp' && showAutocomplete && autocompleteSuggestions.length > 0) {
      e.preventDefault();
      autocompleteHighlightIndex = Math.max(autocompleteHighlightIndex - 1, 0);
      return;
    }
    if (e.key === 'Enter' && showAutocomplete && autocompleteSuggestions.length > 0) {
      const idx = autocompleteHighlightIndex >= 0 ? autocompleteHighlightIndex : 0;
      e.preventDefault();
      selectAutocompleteSuggestion(autocompleteSuggestions[idx]);
      return;
    }
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
    autocompleteHighlightIndex = -1;
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
    if (match.boss) return `Act Boss: ${match.boss}`;
    return 'Unknown';
  }

  function getMatchPillLabel(match) {
    if (match.name) return 'Area';
    if (match.tag) return 'Tag';
    if (match.area_type_tag) return 'Type';
    if (match.boss) return 'Boss';
    return 'Unknown';
  }

  function getMatchPillValue(match) {
    if (match.name) return match.name;
    if (match.tag) return match.tag;
    if (match.area_type_tag) return match.area_type_tag;
    if (match.boss) return match.boss;
    return 'Unknown';
  }

  function getMatchPillClass(match) {
    if (match.name) return 'match-pill-area';
    if (match.tag) return 'match-pill-tag';
    if (match.area_type_tag) return 'match-pill-type';
    if (match.boss) return 'match-pill-boss';
    return 'match-pill-default';
  }

  // Import/Export: Base64 encode/decode (Electron renderer has Buffer)
  function encodeSoundtrack(data) {
    const json = JSON.stringify(data);
    return Buffer.from(json, 'utf8').toString('base64');
  }

  function decodeSoundtrack(encoded) {
    const json = Buffer.from(encoded.trim(), 'base64').toString('utf8');
    return JSON.parse(json);
  }

  function validateSoundtrackData(data) {
    if (!data || typeof data !== 'object') return 'Invalid: not an object';
    if (!data.tracks || !Array.isArray(data.tracks)) return 'Invalid soundtrack format: missing tracks array';
    for (let i = 0; i < data.tracks.length; i++) {
      const t = data.tracks[i];
      if (!t || typeof t !== 'object') return `Invalid track at index ${i}`;
      if (t.matches !== undefined && !Array.isArray(t.matches)) return `Invalid track at index ${i}: matches must be an array`;
    }
    return null;
  }

  // Export/Import modal state
  let showExportModal = false;
  let showImportModal = false;
  let exportEncodedString = '';
  let importInputValue = '';
  let importError = '';

  function openExportModal() {
    exportEncodedString = encodeSoundtrack(soundtrackData);
    showExportModal = true;
  }

  function closeExportModal() {
    showExportModal = false;
    exportEncodedString = '';
  }

  async function copyExportString() {
    try {
      await navigator.clipboard.writeText(exportEncodedString);
      errorMessage = '';
    } catch (err) {
      errorMessage = 'Failed to copy to clipboard';
    }
  }

  function openImportModal() {
    importInputValue = '';
    importError = '';
    showImportModal = true;
  }

  function closeImportModal() {
    showImportModal = false;
    importInputValue = '';
    importError = '';
  }

  async function doImport() {
    const raw = importInputValue.trim();
    if (!raw) {
      importError = 'Please paste an encoded soundtrack string.';
      return;
    }
    let data;
    try {
      data = decodeSoundtrack(raw);
    } catch (err) {
      importError = 'Invalid import code';
      return;
    }
    const validationError = validateSoundtrackData(data);
    if (validationError) {
      importError = validationError;
      return;
    }
    if (!data.options) {
      data.options = { unlinkedZoneBehavior: 'random' };
    } else {
      normalizeOptions(data.options);
      if (!['random', 'silence', 'keep'].includes(data.options.unlinkedZoneBehavior)) {
        data.options.unlinkedZoneBehavior = 'random';
      }
    }
    const result = await ipcRenderer.invoke('applyImportedSoundtrack', data);
    if (!result.success) {
      importError = result.error || 'Failed to apply imported soundtrack';
      return;
    }
    soundtrackData = JSON.parse(JSON.stringify(data));
    currentFilePath = '';
    // Leave originalDataJson unchanged so we stay dirty and warn on close without save
    closeImportModal();
    errorMessage = '';
  }

  async function newSoundtrack() {
    cancelEditTrack();
    const empty = { tracks: [], options: { unlinkedZoneBehavior: 'random' } };
    const result = await ipcRenderer.invoke('applyImportedSoundtrack', empty);
    if (!result.success) {
      errorMessage = result.error || 'Failed to create new soundtrack';
      return;
    }
    soundtrackData = JSON.parse(JSON.stringify(empty));
    currentFilePath = '';
    // Leave originalDataJson unchanged so we stay dirty and warn on close without save
    errorMessage = '';
  }

  async function saveSoundtrack() {
    if (!currentFilePath) {
      await saveSoundtrackAs();
      return;
    }
    try {
      saving = true;
      errorMessage = '';
      const result = await ipcRenderer.invoke('saveSoundtrack', soundtrackData);
      if (result.success) {
        originalDataJson = JSON.stringify(soundtrackData);
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
        defaultPath: currentFilePath || ''
      });

      if (result.canceled || !result.filePath) {
        saving = false;
        return;
      }

      const saveResult = await ipcRenderer.invoke('saveSoundtrackAs', soundtrackData, result.filePath);
      if (saveResult.success) {
        currentFilePath = saveResult.file;
        originalDataJson = JSON.stringify(soundtrackData);
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
      autocompleteHighlightIndex = -1;
    }
  }

  // Delete confirmation
  let showDeleteConfirm = false;
  let deleteTargetIndex = null;

  // Unsaved-changes dialog: 'button' = Cancel clicked, 'window' = OS close requested
  let showUnsavedDialog = false;
  let pendingCloseSource = null; // 'button' | 'window' | null
  // When true, we are closing after Save/Discard — beforeunload must not prevent or we re-open the dialog
  let closingConfirmed = false;

  function requestClose(source) {
    if (isDirty) {
      showUnsavedDialog = true;
      pendingCloseSource = source;
    } else {
      doClose(source);
    }
  }

  function doClose(source) {
    if (source === 'window') {
      ipcRenderer.send('editor-close-confirmed');
    } else {
      onClose();
    }
  }

  function closeUnsavedDialog() {
    showUnsavedDialog = false;
    pendingCloseSource = null;
  }

  async function unsavedDialogSave() {
    try {
      saving = true;
      errorMessage = '';
      if (!currentFilePath) {
        const result = await ipcRenderer.invoke('save-file-dialog', {
          defaultPath: ''
        });
        if (result.canceled || !result.filePath) {
          saving = false;
          return;
        }
        const saveResult = await ipcRenderer.invoke('saveSoundtrackAs', soundtrackData, result.filePath);
        if (saveResult.success) {
          currentFilePath = saveResult.file;
          originalDataJson = JSON.stringify(soundtrackData);
          onSave();
          const source = pendingCloseSource;
          closeUnsavedDialog();
          closingConfirmed = true;
          doClose(source);
        } else {
          errorMessage = saveResult.error || 'Failed to save soundtrack';
        }
        saving = false;
        return;
      }
      const result = await ipcRenderer.invoke('saveSoundtrack', soundtrackData);
      if (result.success) {
        originalDataJson = JSON.stringify(soundtrackData);
        onSave();
        const source = pendingCloseSource;
        closeUnsavedDialog();
        closingConfirmed = true;
        doClose(source);
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

  function unsavedDialogDiscard() {
    const source = pendingCloseSource;
    closeUnsavedDialog();
    closingConfirmed = true;
    doClose(source);
  }

  // Backup: block close from renderer (e.g. when main process close event doesn't prevent on some systems)
  function handleBeforeUnload(e) {
    if (isDirty && !closingConfirmed) {
      e.preventDefault();
      e.returnValue = '';
      requestClose('window');
      return '';
    }
  }
</script>

<svelte:window on:click={handleClickOutside} on:beforeunload={handleBeforeUnload} />

<div 
  class="h-screen flex flex-col bg-bronze-bg p-6 font-pica text-bronze-label overflow-hidden"
  role="main"
  aria-labelledby="editor-title"
>
  <!-- Header -->
  <div class="flex flex-col mb-4 flex-shrink-0">
    <h2 id="editor-title" class="text-2xl font-exocet font-bold uppercase tracking-wide text-bronze-title">
      Edit Soundtrack
    </h2>
    <p class="text-sm text-bronze-label/70 truncate mt-1" title={currentFilePath || 'Unsaved Soundtrack'}>
      {currentFilePath || 'Unsaved Soundtrack'}
    </p>
  </div>

  {#if errorMessage}
    <div class="mb-4 p-2 rounded border border-bronze-border bg-bronze-panel text-bronze-label text-sm flex-shrink-0">
      {errorMessage}
    </div>
  {/if}

  <!-- Soundtrack options: unlinked zone behavior -->
  <div class="mb-4 p-3 rounded border border-bronze-border bg-bronze-panel flex-shrink-0">
    <label for="unlinked-zone-behavior" class="block text-sm font-medium bronze-label mb-2">
      When entering a zone not linked to any track
    </label>
    <select
      id="unlinked-zone-behavior"
      class="bronze-select w-full max-w-md"
      bind:value={soundtrackData.options.unlinkedZoneBehavior}
    >
      {#each UNLINKED_ZONE_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  <!-- Tracks List -->
  <div class="flex-1 flex flex-col min-h-0 mb-4">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="bronze-section-header text-xl">
        Tracks
        {#if filterQuery.trim()}
          ({filteredTracks.length} of {soundtrackData.tracks.length})
        {:else}
          ({soundtrackData.tracks.length})
        {/if}
      </h3>
      <button
        on:click={openAddTrackModal}
        class="bronze-btn-primary"
        disabled={editingTrackIndex !== null || showAddTrackModal}
      >
        Add Track
      </button>
    </div>
    <div class="flex items-center gap-2 mb-2 flex-shrink-0">
      <div class="relative flex-1 min-w-0 flex items-center">
        <input
          type="text"
          bind:value={filterQuery}
          class="w-full bronze-input pr-8"
          placeholder="Filter by track name, area, type or tag"
          aria-label="Filter tracks"
          on:keydown={(e) => e.key === 'Escape' && (filterQuery = '')}
        />
        {#if filterQuery.trim()}
          <button
            type="button"
            on:click={() => (filterQuery = '')}
            class="absolute right-1 p-1 rounded text-bronze-title hover:text-bronze-buttonHover hover:bg-bronze-bg"
            title="Clear filter"
            aria-label="Clear filter"
          >
            <i class="material-icons text-lg">close</i>
          </button>
        {/if}
      </div>
    </div>
    <div class="flex-1 overflow-y-auto overflow-x-hidden space-y-3">
      {#each filteredTracks as { track, index }}
        <div class="track-card rounded border border-bronze-border border-l-4 border-l-bronze-border bg-bronze-panel min-w-0 shadow-sm">
          <!-- Track Header (always visible) -->
          <div class="p-4">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-base truncate text-bronze-label" title={track.name}>{track.name}</div>
              <div class="text-sm text-bronze-label/70 truncate mt-0.5" title={track.location}>{track.location}</div>
              {#if track.matches.length > 0}
                <div class="flex flex-wrap gap-1.5 mt-2">
                  {#each track.matches as match}
                    <span class="text-xs px-2 py-0.5 rounded border {getMatchPillClass(match)}">
                      {getMatchPillLabel(match)}: {getMatchPillValue(match)}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Edit Form (expanded when editing) -->
          {#if editingTrackIndex === index && editingTrack}
            <div class="px-3 pb-3 pt-0 space-y-3 border-t border-bronze-border/50 mt-2">
              <div>
                <label for="edit-track-name-{index}" class="block text-sm mb-1 bronze-label">Track Name</label>
                <input
                  id="edit-track-name-{index}"
                  type="text"
                  bind:value={editingTrack.name}
                  class="w-full bronze-input"
                  placeholder="Track name"
                />
              </div>
              <div>
                <label for="edit-track-url-{index}" class="block text-sm mb-1 bronze-label">YouTube URL</label>
                <input
                  id="edit-track-url-{index}"
                  type="text"
                  bind:value={editingTrack.location}
                  class="w-full bronze-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
              <div>
                <label for="edit-track-matches-{index}" class="block text-sm mb-1 bronze-label">Matches Area</label>
                <div class="space-y-2">
                  {#each editingTrack.matches as match, matchIndex}
                    <div class="flex items-center justify-between bg-bronze-bg p-2 rounded border border-bronze-border/50">
                      <span class="text-sm bronze-label">{getMatchDisplay(match)}</span>
                      <button
                        on:click={() => removeMatch(editingTrackIndex, matchIndex)}
                        class="text-bronze-title hover:text-bronze-buttonHover text-sm"
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
                        on:change={() => matchSearchType === 'boss' && autocompleteSearch(matchInputValue, matchSearchType)}
                        class="bronze-select flex-1 min-w-0"
                      >
                        <option value="name">Name</option>
                        <option value="tag">Tag</option>
                        <option value="area_type_tag">Area Type</option>
                        <option value="boss">Act Boss</option>
                      </select>
                      <input
                        type="text"
                        bind:value={matchInputValue}
                        on:input={(e) => handleMatchInputChange(e.target.value)}
                        on:focus={() => autocompleteSearch(matchInputValue, matchSearchType)}
                        on:keydown={handleAutocompleteKeydown}
                        class="flex-1 bronze-input min-w-0"
                        placeholder="Search or click to browse…"
                      />
                    </div>
                    {#if showAutocomplete}
                      <div class="autocomplete-dropdown absolute z-10 w-full border border-bronze-border bg-bronze-panel max-h-48 overflow-y-auto rounded shadow-lg">
                        {#if autocompleteSuggestions.length > 0}
                          {#each autocompleteSuggestions as suggestion, i}
                            <button
                              on:click={() => selectAutocompleteSuggestion(suggestion)}
                              class="w-full text-left px-2 py-1.5 text-sm bronze-label transition-colors {i === autocompleteHighlightIndex ? 'bg-bronze-button text-bronze-buttonText' : 'hover:bg-bronze-bg'}"
                            >
                              {suggestion.value}
                            </button>
                          {/each}
                        {:else}
                          <div class="px-2 py-3 text-sm text-bronze-label/70 text-center">
                            No results
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <!-- Action Buttons (bottom right) -->
          <div class="px-3 pb-3 pt-2 flex justify-end gap-2 border-t border-bronze-border/50">
            {#if editingTrackIndex === index}
              <button
                on:click={saveEditTrack}
                class="bronze-btn-primary text-xs"
                disabled={loadingYouTube || saving}
              >
                Save
              </button>
              <button
                on:click={cancelEditTrack}
                class="bronze-btn-secondary text-xs"
                disabled={loadingYouTube || saving}
              >
                Cancel
              </button>
            {:else}
              <button
                on:click={() => startEditTrack(index)}
                class="bronze-btn-secondary text-xs"
                disabled={editingTrackIndex !== null}
              >
                Edit
              </button>
              <button
                on:click={() => requestDeleteTrack(index)}
                class="bronze-btn-primary text-xs"
                disabled={editingTrackIndex !== null}
              >
                Delete
              </button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="text-bronze-label/80 text-center py-4">
          {#if soundtrackData.tracks.length === 0}
            No tracks yet. Click "Add Track" to get started.
          {:else}
            No tracks match the filter.
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Save / Load Buttons -->
  <div class="editor-footer flex gap-2 justify-between items-center flex-shrink-0 pt-4 mt-auto border-t border-bronze-border/60 bg-bronze-bg/50 -mx-6 px-6 py-4">
    <div class="flex gap-2">
      <button
        on:click={loadSoundtrackFile}
        class="bronze-btn-accent"
        disabled={saving || editingTrackIndex !== null}
        title="Load a different soundtrack file"
      >
        Load
      </button>
      <button
        on:click={newSoundtrack}
        class="bronze-btn-secondary"
        disabled={saving || editingTrackIndex !== null}
        title="Start a new empty soundtrack"
      >
        New
      </button>
      <button
        on:click={openExportModal}
        class="bronze-btn-secondary"
        disabled={saving || editingTrackIndex !== null}
        title="Export soundtrack as encoded string"
      >
        Export
      </button>
      <button
        on:click={openImportModal}
        class="bronze-btn-secondary"
        disabled={saving || editingTrackIndex !== null}
        title="Import soundtrack from encoded string"
      >
        Import
      </button>
    </div>
    <div class="flex gap-2">
      <button
        on:click={() => requestClose('button')}
        class="bronze-btn-secondary"
        disabled={saving || editingTrackIndex !== null}
      >
        Cancel
      </button>
      <button
        on:click={saveSoundtrack}
        class="bronze-btn-primary"
        disabled={saving || editingTrackIndex !== null}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        on:click={saveSoundtrackAs}
        class="bronze-btn-secondary"
        disabled={saving || editingTrackIndex !== null}
      >
        {saving ? 'Saving...' : 'Save As'}
      </button>
    </div>
  </div>
</div>

<!-- Add Track Modal -->
{#if showAddTrackModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-non-interactive-element-interactions -->
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-6 bronze-overlay bg-black/60"
    on:click={closeAddTrackModal}
    on:keydown={(e) => e.key === 'Escape' && closeAddTrackModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-track-title"
  >
    <div 
      class="bronze-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="flex items-center justify-between mb-6">
        <h3 id="add-track-title" class="text-2xl font-exocet font-bold uppercase tracking-wide text-bronze-title">
          Add New Track
        </h3>
        <button
          on:click={closeAddTrackModal}
          class="p-1 rounded transition-colors text-bronze-title hover:text-bronze-buttonHover"
          title="Close"
        >
          <i class="material-icons">close</i>
        </button>
      </div>

      {#if errorMessage}
        <div class="mb-4 p-2 rounded border border-bronze-border bg-bronze-panel text-bronze-label text-sm">
          {errorMessage}
        </div>
      {/if}

      <!-- Section: TRACK -->
      <div class="mb-6">
        <div class="bronze-section-header mb-3">
          <i class="material-icons text-lg" aria-hidden="true">music_note</i>
          Track
        </div>
        <div class="space-y-3">
          <div>
            <label for="add-track-url" class="block text-sm mb-1 bronze-label">YouTube URL {#if loadingYouTube || isAutoFetching}(Loading...){/if}</label>
            <input
              id="add-track-url"
              type="text"
              bind:value={newTrackUrl}
              class="w-full bronze-input"
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={loadingYouTube || isAutoFetching}
            />
          </div>
          <div>
            <label for="add-track-name" class="block text-sm mb-1 bronze-label">Track Name</label>
            <input
              id="add-track-name"
              type="text"
              bind:value={newTrackName}
              class="w-full bronze-input"
              placeholder="Track name"
              disabled={loadingYouTube}
            />
          </div>
        </div>
      </div>

      <hr class="bronze-section-divider my-4" />

      <!-- Section: MATCHES -->
      <div class="mb-6">
        <div class="bronze-section-header mb-3">
          <i class="material-icons text-lg" aria-hidden="true">place</i>
          Matches
        </div>
        <div class="space-y-2">
          {#each newTrackMatches as match, matchIndex}
            <div class="flex items-center justify-between bg-bronze-bg p-2 rounded border border-bronze-border/50">
              <span class="text-sm bronze-label">{getMatchDisplay(match)}</span>
              <button
                on:click={() => newTrackMatches = newTrackMatches.filter((_, i) => i !== matchIndex)}
                class="text-bronze-title hover:text-bronze-buttonHover text-sm"
                title="Remove match"
              >
                <i class="material-icons text-base">delete</i>
              </button>
            </div>
          {/each}
          <div class="autocomplete-container relative">
            <div class="flex gap-2 mb-2">
              <select
                bind:value={matchSearchType}
                on:change={() => matchSearchType === 'boss' && autocompleteSearch(matchInputValue, matchSearchType)}
                class="bronze-select flex-1 min-w-0"
              >
                <option value="name">Name</option>
                <option value="tag">Tag</option>
                <option value="area_type_tag">Area Type</option>
                <option value="boss">Act Boss</option>
              </select>
              <input
                type="text"
                bind:value={matchInputValue}
                on:input={(e) => handleMatchInputChange(e.target.value)}
                on:focus={() => autocompleteSearch(matchInputValue, matchSearchType)}
                on:keydown={handleAutocompleteKeydown}
                class="flex-1 bronze-input min-w-0"
                placeholder="Search or click to browse…"
              />
            </div>
            {#if showAutocomplete}
              <div class="autocomplete-dropdown absolute z-10 w-full border border-bronze-border bg-bronze-panel max-h-48 overflow-y-auto rounded shadow-lg">
                {#if autocompleteSuggestions.length > 0}
                  {#each autocompleteSuggestions as suggestion, i}
                    <button
                      on:click={() => selectAutocompleteSuggestion(suggestion)}
                      class="w-full text-left px-2 py-1.5 text-sm bronze-label transition-colors {i === autocompleteHighlightIndex ? 'bg-bronze-button text-bronze-buttonText' : 'hover:bg-bronze-bg'}"
                    >
                      {suggestion.value}
                    </button>
                  {/each}
                {:else}
                  <div class="px-2 py-3 text-sm text-bronze-label/70 text-center">
                    No results
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex gap-2 justify-end">
        <button
          on:click={closeAddTrackModal}
          class="bronze-btn-secondary"
          disabled={loadingYouTube || saving}
        >
          Cancel
        </button>
        <button
          on:click={addTrack}
          class="bronze-btn-primary"
          disabled={loadingYouTube || saving || !newTrackUrl.trim()}
        >
          Add Track
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Export Modal -->
{#if showExportModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-non-interactive-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-6 bronze-overlay bg-black/60"
    on:click={closeExportModal}
    on:keydown={(e) => e.key === 'Escape' && closeExportModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="export-modal-title"
  >
    <div
      class="bronze-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="flex items-center justify-between mb-4">
        <h3 id="export-modal-title" class="text-2xl font-exocet font-bold uppercase tracking-wide text-bronze-title">
          Export Soundtrack
        </h3>
        <button
          on:click={closeExportModal}
          class="p-1 rounded transition-colors text-bronze-title hover:text-bronze-buttonHover"
          title="Close"
        >
          <i class="material-icons">close</i>
        </button>
      </div>
      <p class="text-sm text-bronze-label/80 mb-2">Copy this encoded string to share or backup your soundtrack:</p>
      <textarea
        readonly
        value={exportEncodedString}
        class="w-full bronze-input font-mono text-sm min-h-[120px] resize-y"
        aria-label="Exported soundtrack string"
      />
      <div class="flex gap-2 justify-end mt-3">
        <button
          on:click={copyExportString}
          class="bronze-btn-primary"
        >
          Copy
        </button>
        <button
          on:click={closeExportModal}
          class="bronze-btn-secondary"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Import Modal -->
{#if showImportModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-non-interactive-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-6 bronze-overlay bg-black/60"
    on:click={closeImportModal}
    on:keydown={(e) => e.key === 'Escape' && closeImportModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-modal-title"
  >
    <div
      class="bronze-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="flex items-center justify-between mb-4">
        <h3 id="import-modal-title" class="text-2xl font-exocet font-bold uppercase tracking-wide text-bronze-title">
          Import Soundtrack
        </h3>
        <button
          on:click={closeImportModal}
          class="p-1 rounded transition-colors text-bronze-title hover:text-bronze-buttonHover"
          title="Close"
        >
          <i class="material-icons">close</i>
        </button>
      </div>
      <p class="text-sm text-bronze-label/80 mb-2">Paste an encoded soundtrack string below:</p>
      <textarea
        bind:value={importInputValue}
        class="w-full bronze-input font-mono text-sm min-h-[120px] resize-y"
        placeholder="Paste encoded soundtrack here"
        aria-label="Encoded soundtrack string to import"
      />
      {#if importError}
        <div class="mt-3 p-3 rounded border-2 border-amber-500/80 bg-amber-950/40 text-amber-200 text-sm font-medium shadow-sm">
          {importError}
        </div>
      {/if}
      <div class="flex gap-2 justify-end mt-3">
        <button
          on:click={closeImportModal}
          class="bronze-btn-secondary"
        >
          Cancel
        </button>
        <button
          on:click={doImport}
          class="bronze-btn-primary"
        >
          Import
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Unsaved Changes Dialog -->
{#if showUnsavedDialog}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-non-interactive-element-interactions -->
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center p-6 bronze-overlay bg-black/60"
    on:click={() => closeUnsavedDialog()}
    on:keydown={(e) => e.key === 'Escape' && closeUnsavedDialog()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="unsaved-dialog-title"
  >
    <div
      class="bronze-panel w-full max-w-md p-6 mx-4"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <h3 id="unsaved-dialog-title" class="text-xl font-exocet font-bold uppercase tracking-wide text-bronze-title mb-3">
        Unsaved Changes
      </h3>
      <p class="text-bronze-label mb-6">
        You have unsaved changes. Would you like to save before closing?
      </p>
      {#if errorMessage}
        <div class="mb-4 p-2 rounded border border-bronze-border bg-bronze-bg text-bronze-label text-sm">
          {errorMessage}
        </div>
      {/if}
      <div class="flex gap-2 justify-end">
        <button
          on:click={closeUnsavedDialog}
          class="bronze-btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          on:click={unsavedDialogDiscard}
          class="bronze-btn-secondary"
          disabled={saving}
        >
          Discard
        </button>
        <button
          on:click={unsavedDialogSave}
          class="bronze-btn-primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Track Confirmation Dialog -->
{#if showDeleteConfirm && deleteTargetIndex != null}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-non-interactive-element-interactions -->
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center p-6 bronze-overlay bg-black/60"
    on:click={cancelDeleteConfirm}
    on:keydown={(e) => e.key === 'Escape' && cancelDeleteConfirm()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-dialog-title"
  >
    <div
      class="bronze-panel w-full max-w-md p-6 mx-4"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <h3 id="delete-dialog-title" class="text-xl font-exocet font-bold uppercase tracking-wide text-bronze-title mb-3">
        Delete Track
      </h3>
      <p class="text-bronze-label mb-6">
        Are you sure you want to delete this track?
        {#if soundtrackData.tracks[deleteTargetIndex]}
          <span class="block mt-2 font-bold truncate" title={soundtrackData.tracks[deleteTargetIndex].name}>
            "{soundtrackData.tracks[deleteTargetIndex].name}"
          </span>
        {/if}
      </p>
      <div class="flex gap-2 justify-end">
        <button
          on:click={cancelDeleteConfirm}
          class="bronze-btn-secondary"
        >
          Cancel
        </button>
        <button
          on:click={confirmDeleteTrack}
          class="bronze-btn-primary"
        >
          Delete
        </button>
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

  .match-pill-area {
    @apply text-bronze-label/90 bg-bronze-bg border-bronze-border/60;
  }
  .match-pill-tag {
    color: #0ba5a5;
    background-color: rgba(11, 165, 165, 0.2);
    border-color: rgba(11, 165, 165, 0.5);
  }
  .match-pill-type {
    color: #C9A86C;
    background-color: rgba(201, 168, 108, 0.15);
    border-color: rgba(201, 168, 108, 0.4);
  }
  .match-pill-boss {
    color: #d82f2f;
    background-color: rgba(216, 47, 47, 0.2);
    border-color: rgba(216, 47, 47, 0.5);
  }
  .match-pill-default {
    @apply text-bronze-label/70 bg-bronze-bg border-bronze-border/50;
  }
</style>
