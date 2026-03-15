(function () {
  'use strict';

  var ROLE_NAV = {
    buyer: [
      { label: 'Biochar Market', href: 'buyer.html' },
      { label: 'Biomass Market', href: 'feedstock.html' }
    ],
    seller: [
      { label: 'Find Feedstock', href: 'feedstock.html' },
      { label: 'Post Demand', href: 'producer-demand.html' },
      { label: 'My Listings', href: 'seller.html' }
    ],
    third_party: [
      { label: 'Feedstock', href: 'feedstock.html' },
      { label: 'Demand', href: 'producer-demand-browse.html' }
    ]
  };

  function buildRoleNav(role) {
    var links = ROLE_NAV[role] || ROLE_NAV['buyer'];
    return links.map(function (l) {
      return '<a href="' + l.href + '" style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-decoration:none;font-weight:500;padding:var(--space-1) var(--space-2);border-radius:var(--radius-md);transition:background 0.15s" onmouseover="this.style.background=\'var(--color-bg)\'" onmouseout="this.style.background=\'\'">' + l.label + '</a>';
    }).join('');
  }

  function insertRoleNav(role) {
    var slot = document.getElementById('role-nav-slot');
    if (slot) slot.innerHTML = buildRoleNav(role);
  }

  function updateAuthNav(user, role) {
    var login = document.getElementById('nav-login');
    var profile = document.getElementById('nav-profile');
    var logout = document.getElementById('nav-logout');
    var settings = document.getElementById('nav-settings');
    if (user) {
      if (login) { login.style.display = 'none'; login.classList.add('hidden'); }
      if (profile) { profile.style.display = 'inline-flex'; profile.classList.remove('hidden'); }
      if (logout) { profile.style.display = 'inline-flex'; logout.classList.remove('hidden'); }
      if (settings) { settings.style.display = 'inline-flex'; settings.classList.remove('hidden'); }
      insertRoleNav(role || 'buyer');
    } else {
      if (login) { login.style.display = 'inline-flex'; login.classList.remove('hidden'); }
      if (profile) { profile.style.display = 'none'; profile.classList.add('hidden'); }
      if (logout) { logout.style.display = 'none'; logout.classList.add('hidden'); }
      var slot = document.getElementById('role-nav-slot');
      if (slot) slot.innerHTML = '';
    }
  }

  window.AuthState = {
    user: null,
    profile: null,
    onReady: function (cb) {
      firebase.auth().onAuthStateChanged(function (user) {
        window.AuthState.user = user;
        if (user) {
          firebase.firestore().collection('users').doc(user.uid).get()
            .then(function (doc) {
              window.AuthState.profile = doc.exists ? doc.data() : null;
              var role = window.AuthState.profile ? window.AuthState.profile.role : 'buyer';
              updateAuthNav(user, role);
              if (cb) cb(user, window.AuthState.profile);
            })
            .catch(function () {
              updateAuthNav(user, 'buyer');
              if (cb) cb(user, null);
            });
        } else {
          window.AuthState.profile = null;
          updateAuthNav(null, null);
          if (cb) cb(null, null);
        }
      });
    }
  };
})();
