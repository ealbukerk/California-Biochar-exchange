(function () {
  'use strict';

  var ROLE_NAV = {
    buyer: [
      { label: '🌾 Buy Biochar', href: 'buyer.html' },
      { label: 'Biomass Market', href: 'feedstock.html' },
      { label: 'Carriers', href: 'carriers.html' },
      { label: 'My Profile', href: 'profile.html' }
    ],
    seller: [
      { label: '🔥 My Listings', href: 'seller.html' },
      { label: 'Find Feedstock', href: 'feedstock.html' },
      { label: 'Post Demand', href: 'producer-demand.html' },
      { label: 'Carriers', href: 'carriers.html' },
      { label: 'My Profile', href: 'profile.html' }
    ],
    third_party: [
      { label: 'Feedstock', href: 'feedstock.html' },
      { label: 'Demand', href: 'producer-demand-browse.html' },
      { label: 'My Profile', href: 'profile.html' }
    ]
  };

  function buildRoleNav(role) {
    var links = ROLE_NAV[role] || ROLE_NAV['buyer'];
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    return links.map(function(l) {
      var isActive = currentPage === l.href;
      return '<a href="' + l.href + '" style="font-size:var(--font-size-sm);color:' + (isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)') + ';text-decoration:none;font-weight:' + (isActive ? '700' : '500') + ';padding:var(--space-1) var(--space-2);border-radius:var(--radius-md);transition:background 0.15s;' + (isActive ? 'border-bottom:2px solid var(--color-accent);' : '') + '" onmouseover="this.style.background=\'var(--color-bg)\'" onmouseout="this.style.background=\'\'">' + l.label + '</a>';
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
      if (profile) { profile.style.display = 'none'; profile.classList.add('hidden'); }
      if (logout) { logout.style.display = 'none'; logout.classList.add('hidden'); }
      if (settings) { settings.style.display = 'none'; settings.classList.add('hidden'); }
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
              if (window.AuthState.profile && window.AuthState.profile.role === 'buyer') {
                firebase.firestore().collection('feedstock_listings')
                  .where('supplierUID', '==', user.uid)
                  .where('status', '==', 'active')
                  .get()
                  .then(function(snap) {
                    window.AuthState.profile.hasBiomassAvailable = !snap.empty;
                    window.AuthState.profile._biomassListings = [];
                    snap.forEach(function(d) {
                      var data = d.data();
                      data._id = d.id;
                      window.AuthState.profile._biomassListings.push(data);
                    });
                    if (cb) cb(user, window.AuthState.profile);
                  })
                  .catch(function() { if (cb) cb(user, window.AuthState.profile); });
              } else {
                if (cb) cb(user, window.AuthState.profile);
              }
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
