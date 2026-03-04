window.US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming"
]

function buildStateSelect(selectEl, includeBlank) {
  if (includeBlank) {
    const blank = document.createElement('option')
    blank.value = ''
    blank.textContent = 'Select state'
    selectEl.appendChild(blank)
  }
  window.US_STATES.forEach(state => {
    const opt = document.createElement('option')
    opt.value = state
    opt.textContent = state
    selectEl.appendChild(opt)
  })
}
