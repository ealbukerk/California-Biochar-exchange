(function () {
  function renderVerifiedBadge() {
    return '<span class="verified-badge" title="Verified — 90%+ delivery confirmation and 4.0+ average rating">✓ Verified</span>';
  }

  window.renderVerifiedBadge = renderVerifiedBadge;

  function ensureLoginLink(navLinks, isLoggedIn) {
    if (!navLinks) {
      return;
    }

    var existing = navLinks.querySelector('[data-auth-login="true"]');

    if (isLoggedIn) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    if (!existing) {
      var li = document.createElement("li");
      li.setAttribute("data-auth-login", "true");
      li.innerHTML = '<a href="auth.html">Log in</a>';
      navLinks.appendChild(li);
    }
  }

  function clearAuthControls(navInner) {
    var controls = navInner.querySelector(".nav-auth-controls");
    if (controls) {
      controls.remove();
    }
  }

  function renderLoggedOut(navInner, navLinks) {
    clearAuthControls(navInner);
    var cta = navInner.querySelector(".nav-cta");
    if (cta) {
      cta.style.display = "inline-flex";
    }
    ensureLoginLink(navLinks, false);
  }

  function renderLoggedIn(navInner, navLinks, profile) {
    ensureLoginLink(navLinks, true);

    var cta = navInner.querySelector(".nav-cta");
    if (cta) {
      cta.style.display = "none";
    }

    clearAuthControls(navInner);

    var controls = document.createElement("div");
    controls.className = "nav-auth-controls";
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "var(--space-3)";

    var business = document.createElement("span");
    business.textContent = (profile && (profile.businessName || profile.name)) || "Account";
    business.style.fontSize = "var(--font-size-sm)";
    business.style.color = "var(--color-text-secondary)";

    var profileLink = document.createElement("a");
    profileLink.className = "btn btn-secondary";
    profileLink.href = "profile.html";
    profileLink.textContent = "Profile";

    var logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "btn btn-primary";
    logoutBtn.textContent = "Log out";
    logoutBtn.addEventListener("click", function () {
      auth.signOut();
    });

    controls.appendChild(business);
    controls.appendChild(profileLink);
    controls.appendChild(logoutBtn);
    navInner.appendChild(controls);
  }

  function updateNavForState(isLoggedIn, profile) {
    document.querySelectorAll("nav .nav-inner").forEach(function (navInner) {
      var navLinks = navInner.querySelector(".nav-links");
      if (isLoggedIn) {
        renderLoggedIn(navInner, navLinks, profile);
      } else {
        renderLoggedOut(navInner, navLinks);
      }
    });
  }

  function startAuthStateWatcher() {
    if (typeof auth === "undefined" || typeof db === "undefined") {
      return;
    }

    auth.onAuthStateChanged(async function (user) {
      if (user) {
        window.currentUser = user.uid;

        var profile = null;
        try {
          var doc = await db.collection("users").doc(user.uid).get();
          profile = doc.exists ? doc.data() : null;
        } catch (error) {
          profile = null;
        }

        window.userProfile = profile;
        window.userVerified = !!(profile && profile.verified === true);
        updateNavForState(true, profile);
      } else {
        window.currentUser = null;
        window.userProfile = null;
        window.userVerified = false;
        updateNavForState(false, null);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAuthStateWatcher);
  } else {
    startAuthStateWatcher();
  }
})();
