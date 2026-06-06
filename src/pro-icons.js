/* ============================================================
   PRO ICON SYSTEM — inline SVG, unified stroke style
   Replaces ALL emoji across the UI with professional icons.
   Stroke-based, 24x24 viewBox, currentColor.
   ============================================================ */
window.NEWSMAP_ICONS = {
  // --- Map style layers ---
  news:       '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
  marine:     '<path d="M3 14c2 1 3 1 5 0s3-1 5 0 3 1 5 0"/><path d="M3 18c2 1 3 1 5 0s3-1 5 0 3 1 5 0"/><path d="M12 4v7"/><path d="M8 7l4-3 4 3"/>',
  satellite:  '<path d="M5 12l-2-2 3-3 2 2"/><path d="M12 5l3-3 3 3-3 3z"/><path d="M9 9l6 6"/><path d="M14 14l-2 2 3 3 2-3z" fill="currentColor"/>',
  terrain:    '<path d="M3 18l5-8 4 5 3-4 6 7z"/>',
  topo:       '<path d="M12 3l8 14H4z"/><path d="M9 12h6"/>',
  dark:       '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>',
  toner:      '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  streets:    '<path d="M7 3v18M17 3v18"/><path d="M3 7h18M3 17h18"/>',
  hybrid:     '<path d="M12 5l3-3 3 3-3 3z"/><path d="M9 9l6 6"/><circle cx="7" cy="17" r="2"/>',
  dataviz:    '<path d="M4 20V10M9 20V4M14 20v-8M19 20V7"/>',
  positron:   '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  bright:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  // --- Labels ---
  globe:      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  star:       '<path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14 3 9.5 9.5 9z" fill="currentColor"/>',
  pin:        '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
  // --- Live tracking ---
  ship:       '<path d="M3 15l1.5 5h15L21 15z"/><path d="M5 15V9h14v6"/><path d="M12 3v6"/><path d="M9 9h6"/>',
  plane:      '<path d="M12 2l2 7 7 3-7 1-2 8-2-8-7-1 7-3z" fill="currentColor"/>',
  radar:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12l7-4"/>',
  // --- Tools / actions ---
  undo:       '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>',
  redo:       '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h3"/>',
  motionpath: '<path d="M3 17c4 0 4-10 8-10s4 10 8 10"/><circle cx="3" cy="17" r="2" fill="currentColor"/><circle cx="19" cy="17" r="2" fill="currentColor"/>',
  spotlight:  '<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  logo:       '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16l3-6 3 4 2-3"/>',
  rangering:  '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  autosave:   '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M7 3v5h8"/><circle cx="12" cy="14" r="3"/>',
  restore:    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  preset:     '<path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14 3 9.5 9.5 9z"/>',
  trash:      '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
  save:       '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  load:       '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  zoomin:     '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
  zoomout:    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
  home:       '<path d="M3 11l9-8 9 8"/><path d="M5 9v11h14V9"/>',
  play:       '<path d="M7 4l12 8-12 8z" fill="currentColor"/>',
  prev:       '<path d="M15 4L7 12l8 8z" fill="currentColor"/>',
  next:       '<path d="M9 4l8 8-8 8z" fill="currentColor"/>',
  close:      '<path d="M5 5l14 14M19 5L5 19"/>',
  hideui:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  countries:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  // panel header icons
  mapstyle:   '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  labels:     '<path d="M9 3H4v5l11 11 5-5z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/>',
  tracking:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12l7-4"/>',
  touch:      '<path d="M8 11V5a2 2 0 0 1 4 0v6m0-2a2 2 0 0 1 4 0v2m0-1a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l2 2"/>',
  eye:        '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  clipboard:  '<rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h4"/>',
  film:       '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  studio:     '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'
};

// Helper: build an <svg> string
window.svgIcon = function(name, size) {
  size = size || 18;
  const body = window.NEWSMAP_ICONS[name];
  if (!body) return '';
  return '<svg class="pro-icon" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    body + '</svg>';
};
