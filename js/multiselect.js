function makeMultiSelect(containerEl, options, placeholder) {
  if (!containerEl) {
    return;
  }

  var normalizedOptions = Array.isArray(options) ? options.slice() : [];
  if (normalizedOptions.indexOf("All") === -1) {
    normalizedOptions.unshift("All");
  }

  var selected = ["All"];

  containerEl.classList.add("ms-wrapper");
  containerEl.innerHTML =
    '<div class="ms-box" tabindex="0" role="button" aria-expanded="false"></div>' +
    '<div class="ms-dropdown" hidden></div>';

  var box = containerEl.querySelector(".ms-box");
  var dropdown = containerEl.querySelector(".ms-dropdown");

  dropdown.innerHTML = '<p class="ms-hint">Select all that apply</p>';

  normalizedOptions.forEach(function (option) {
    var id =
      "ms-" +
      Math.random()
        .toString(36)
        .slice(2, 9);

    var optionEl = document.createElement("label");
    optionEl.className = "ms-option";
    optionEl.setAttribute("for", id);
    optionEl.innerHTML =
      '<input type="checkbox" id="' + id + '" value="' + option + '" />' +
      "<span>" +
      option +
      "</span>";
    dropdown.appendChild(optionEl);
  });

  function syncChecks() {
    dropdown.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      input.checked = selected.indexOf(input.value) !== -1;
    });
  }

  function updateBoxText() {
    var values = selected.filter(function (value) {
      return value !== "All";
    });

    if (values.length === 0) {
      box.textContent = placeholder;
      return;
    }

    var text = values.join(", ");
    box.textContent = text.length > 40 ? text.slice(0, 40) + "..." : text;
  }

  function closeDropdown() {
    dropdown.hidden = true;
    box.classList.remove("open");
    box.setAttribute("aria-expanded", "false");
  }

  function openDropdown() {
    dropdown.hidden = false;
    box.classList.add("open");
    box.setAttribute("aria-expanded", "true");
  }

  box.addEventListener("click", function () {
    if (dropdown.hidden) {
      openDropdown();
    } else {
      closeDropdown();
    }
  });

  box.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (dropdown.hidden) {
        openDropdown();
      } else {
        closeDropdown();
      }
    }
  });

  dropdown.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || target.type !== "checkbox") {
      return;
    }

    if (target.value === "All" && target.checked) {
      selected = ["All"];
    } else {
      var withoutAll = selected.filter(function (value) {
        return value !== "All";
      });

      if (target.checked) {
        if (withoutAll.indexOf(target.value) === -1) {
          withoutAll.push(target.value);
        }
      } else {
        withoutAll = withoutAll.filter(function (value) {
          return value !== target.value;
        });
      }

      selected = withoutAll.length ? withoutAll : ["All"];
    }

    syncChecks();
    updateBoxText();
    containerEl.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.addEventListener("click", function (event) {
    if (!containerEl.contains(event.target)) {
      closeDropdown();
    }
  });

  containerEl.getValue = function () {
    return selected.slice();
  };

  containerEl.setValue = function (values) {
    var next = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!next.length || next.indexOf("All") !== -1) {
      selected = ["All"];
    } else {
      selected = next.filter(function (value) {
        return normalizedOptions.indexOf(value) !== -1 && value !== "All";
      });
      if (!selected.length) {
        selected = ["All"];
      }
    }

    syncChecks();
    updateBoxText();
    containerEl.dispatchEvent(new Event("change", { bubbles: true }));
  };

  syncChecks();
  updateBoxText();
}
