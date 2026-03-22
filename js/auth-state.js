(function () {
  'use strict';

  var BUY_NAV = [
    { label: 'Browse Biochar', href: 'buyer.html', mode: 'buy' },
    { label: 'Biomass Market', href: 'feedstock.html', mode: 'buy' },
    { label: 'Carriers', href: 'carriers.html', mode: 'buy' }
  ];

  var SELL_NAV = [
    { label: 'List Biochar', href: 'seller.html', mode: 'sell' },
    { label: 'Find Feedstock', href: 'feedstock.html', mode: 'sell' },
    { label: 'Post Demand', href: 'producer-demand.html', mode: 'sell' },
    { label: 'My Listings', href: 'seller.html', mode: 'sell' }
  ];

  var SELL_PAGES = ['seller.html','producer-demand.html','producer-demand-browse.html','list-feedstock.html','feedstock-listing.html'];
  var BUY_PAGES = ['buyer.html','listing.html','listings.html'];

  function getDefaultMode(role, currentPage) {
    if (SELL_PAGES.indexOf(currentPage) !== -1) return 'sell';
    if (BUY_PAGES.indexOf(currentPage) !== -1) return 'buy';
    if (role === 'seller') return 'sell';
    return localStorage.getItem('bm_nav_mode') || 'buy';
  }

  function setMode(mode) {
    localStorage.setItem('bm_nav_mode', mode);
    renderModeLinks(mode);
    var buyBtn = document.getElementById('bm-mode-buy');
    var sellBtn = document.getElementById('bm-mode-sell');
    if (buyBtn) { buyBtn.classList.toggle('active', mode === 'buy'); buyBtn.classList.toggle('buy', mode === 'buy'); }
    if (sellBtn) { sellBtn.classList.toggle('active', mode === 'sell'); sellBtn.classList.toggle('sell', mode === 'sell'); }
  }

  function renderModeLinks(mode) {
    var slot = document.getElementById('bm-nav-links');
    if (!slot) return;
    var links = mode === 'sell' ? SELL_NAV : BUY_NAV;
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    slot.innerHTML = links.map(function(l) {
      var isActive = currentPage === l.href;
      return '<a href="' + l.href + '" class="bm-nav-link' + (isActive ? ' active' + (mode === 'sell' ? ' sell-link' : '') : '') + '">' + l.label + '</a>';
    }).join('');
  }

  function buildNav(user, profile) {
    var existing = document.getElementById('bm-nav');
    if (existing) existing.parentNode.removeChild(existing);

    var nav = document.createElement('nav');
    nav.className = 'bm-nav';
    nav.id = 'bm-nav';

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var role = profile ? profile.role : 'buyer';
    var mode = getDefaultMode(role, currentPage);

    var initial = profile ? (profile.businessName || profile.name || '') : '';
    var initials = initial ? initial.charAt(0).toUpperCase() : '?';

    nav.innerHTML =
      '<div class="container bm-nav-inner">' +
        '<a class="bm-nav-logo" href="index.html">Biochar.market</a>' +

        (user ?
          '<div class="bm-mode-bar">' +
            '<button id="bm-mode-buy" class="bm-mode-btn' + (mode === 'buy' ? ' active buy' : '') + '">🌾 Buying</button>' +
            '<button id="bm-mode-sell" class="bm-mode-btn' + (mode === 'sell' ? ' active sell' : '') + '">🔥 Selling</button>' +
          '</div>'
        : '') +

        '<div class="bm-nav-right">' +
          '<div id="bm-nav-links" class="bm-nav-links"></div>' +
          (user ?
            '<div style="position:relative">' +
              '<button class="bm-avatar" id="bm-avatar-btn" title="Account">' + initials + '</button>' +
              '<div class="bm-avatar-dropdown" id="bm-avatar-dropdown">' +
                '<a href="profile.html">Profile</a>' +
                '<a href="settings.html">Settings</a>' +
                '<button class="signout-btn" id="bm-signout-btn">Sign out</button>' +
              '</div>' +
            '</div>'
          :
            '<a href="auth.html" class="btn btn-primary" style="font-size:var(--font-size-sm)">Sign in</a>'
          ) +
        '</div>' +
      '</div>';

    var oldNav = document.querySelector('nav');
    if (oldNav) {
      oldNav.parentNode.replaceChild(nav, oldNav);
    } else {
      document.body.insertBefore(nav, document.body.firstChild);
    }

    if (user) {
      renderModeLinks(mode);

      document.getElementById('bm-mode-buy').addEventListener('click', function() { setMode('buy'); });
      document.getElementById('bm-mode-sell').addEventListener('click', function() { setMode('sell'); });

      var avatarBtn = document.getElementById('bm-avatar-btn');
      var dropdown = document.getElementById('bm-avatar-dropdown');
      avatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function() { dropdown.classList.remove('open'); });

      document.getElementById('bm-signout-btn').addEventListener('click', function() {
        firebase.auth().signOut().then(function() { window.location.href = 'index.html'; });
      });
    } else {
      var slot = document.getElementById('bm-nav-links');
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
              buildNav(user, window.AuthState.profile);
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
              buildNav(user, null);
              if (cb) cb(user, null);
            });
        } else {
          window.AuthState.profile = null;
          buildNav(null, null);
          if (cb) cb(null, null);
        }
      });
    }
  };

  function initNavListener() {
    firebase.auth().onAuthStateChanged(function(user) {
      var existing = document.getElementById('bm-nav');
      if (existing) existing.parentNode.removeChild(existing);

      if (user) {
        firebase.firestore().collection('users').doc(user.uid).get()
          .then(function(doc) {
            var profile = doc.exists ? doc.data() : null;
            buildNav(user, profile);
          })
          .catch(function() { buildNav(user, null); });
      } else {
        buildNav(null, null);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavListener);
  } else {
    initNavListener();
  }

})();
