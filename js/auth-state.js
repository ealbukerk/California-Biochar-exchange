(function () {
  'use strict';

  var PAGE_CONTEXT = {
    'buyer.html':                { role: 'buyer',  market: 'biochar' },
    'listing.html':              { role: 'buyer',  market: 'biochar' },
    'listings.html':             { role: 'buyer',  market: 'biochar' },
    'feedstock.html':            { role: 'buyer',  market: 'biomass' },
    'feedstock-listing.html':    { role: 'buyer',  market: 'biomass' },
    'producer-demand-browse.html':{ role: 'buyer', market: 'biomass' },
    'seller.html':               { role: 'seller', market: 'biochar' },
    'apply-wizard.html':         { role: 'seller', market: 'biochar' },
    'list-feedstock.html':       { role: 'seller', market: 'biomass' },
    'producer-demand.html':      { role: 'seller', market: 'biomass' },
    'carbon.html':               { role: 'buyer',  market: 'carbon' },
    'carbon-listing.html':       { role: 'buyer',  market: 'carbon' },
    'list-credit.html':          { role: 'seller', market: 'carbon' },
    'carbon-dealroom.html':      { role: 'buyer',  market: 'carbon' }
  };

  var DEST = {
    buyer:  { biochar: 'buyer.html',         biomass: 'feedstock.html' },
    seller: { biochar: 'seller.html',        biomass: 'list-feedstock.html' }
  };

  function getContext(currentPage, profileRole) {
    if (PAGE_CONTEXT[currentPage]) return PAGE_CONTEXT[currentPage];
    var savedRole   = localStorage.getItem('bm_nav_role')   || profileRole || 'buyer';
    var savedMarket = localStorage.getItem('bm_nav_market') || 'biochar';
    return { role: savedRole, market: savedMarket };
  }

  function navigate(role, market) {
    if (market !== 'carbon') {
      localStorage.setItem('bm_nav_role',   role);
      localStorage.setItem('bm_nav_market', market);
    }
    var dest = DEST[role] && DEST[role][market] ? DEST[role][market] : 'buyer.html';
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage !== dest) window.location.href = dest;
  }

  function updateSliders(role, market) {
    var rBuyer  = document.getElementById('bm-role-buyer');
    var rSeller = document.getElementById('bm-role-seller');
    var mBio    = document.getElementById('bm-mkt-biochar');
    var mBio2   = document.getElementById('bm-mkt-biomass');
    if (rBuyer)  rBuyer.classList.toggle('active',  role   === 'buyer');
    if (rSeller) rSeller.classList.toggle('active', role   === 'seller');
    if (mBio)    mBio.classList.toggle('active',    market === 'biochar');
    if (mBio2)   mBio2.classList.toggle('active',   market === 'biomass');
  }

  function buildNav(user, profile) {
    var existing = document.getElementById('bm-nav');
    if (existing) existing.parentNode.removeChild(existing);

    var nav = document.createElement('nav');
    nav.className = 'bm-nav';
    nav.id = 'bm-nav';

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var profileRole = profile ? profile.role : 'buyer';
    var ctx = getContext(currentPage, profileRole);
    var role   = ctx.role;
    var market = ctx.market;
    var isCarbon = market === 'carbon';

    var initial  = profile ? (profile.businessName || profile.name || '') : '';
    var initials = initial ? initial.charAt(0).toUpperCase() : '?';

    nav.innerHTML =
      '<div class="container bm-nav-inner">' +
        '<a class="bm-nav-logo" href="index.html">Biochar.market</a>' +

        (isCarbon
          ? '<div style="flex:1;display:flex;justify-content:center">' +
              '<div style="font-weight:600;color:#2D4A3E">Carbon Credits</div>' +
            '</div>'
          : (user
            ? '<div style="display:flex;align-items:center;gap:var(--space-3);flex:1;justify-content:center">' +
                '<div class="bm-mode-bar" style="gap:0">' +
                  '<button id="bm-role-buyer"  class="bm-mode-btn' + (role==='buyer'  ? ' active buy'  : '') + '">Buyer</button>' +
                  '<button id="bm-role-seller" class="bm-mode-btn' + (role==='seller' ? ' active sell' : '') + '">Seller</button>' +
                '</div>' +
                '<div class="bm-mode-bar" style="gap:0">' +
                  '<button id="bm-mkt-biochar" class="bm-mode-btn' + (market==='biochar' ? ' active buy'  : '') + '">Biochar</button>' +
                  '<button id="bm-mkt-biomass" class="bm-mode-btn' + (market==='biomass' ? ' active sell' : '') + '">Biomass</button>' +
                '</div>' +
              '</div>'
            : '<div style="flex:1"></div>')) +

        '<div class="bm-nav-right">' +
          '<a href="carbon.html" class="bm-nav-link" style="color:#2D4A3E">Carbon Credits</a>' +
          (user ?
            '<div style="position:relative">' +
              '<button class="bm-avatar" id="bm-avatar-btn" title="Account">' +
                (profile && profile.profilePhotoUrl
                  ? '<img src="' + profile.profilePhotoUrl + '" alt="Account" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.remove(); this.nextSibling.style.display=\'flex\'"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center">' + initials + '</span>'
                  : initials) +
              '</button>' +
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

    if (user && !isCarbon) {
      document.getElementById('bm-role-buyer').addEventListener('click',  function() { navigate('buyer',  market); });
      document.getElementById('bm-role-seller').addEventListener('click', function() { navigate('seller', market); });
      document.getElementById('bm-mkt-biochar').addEventListener('click', function() { navigate(role, 'biochar'); });
      document.getElementById('bm-mkt-biomass').addEventListener('click', function() { navigate(role, 'biomass'); });

      var avatarBtn  = document.getElementById('bm-avatar-btn');
      var dropdown   = document.getElementById('bm-avatar-dropdown');
      avatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function() { dropdown.classList.remove('open'); });
      document.getElementById('bm-signout-btn').addEventListener('click', function() {
        firebase.auth().signOut().then(function() { window.location.href = 'index.html'; });
      });
    }
  }

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

  window.AuthState = {
    user: null,
    profile: null,
    onReady: function(cb) {
      firebase.auth().onAuthStateChanged(function(user) {
        window.AuthState.user = user;
        if (user) {
          firebase.firestore().collection('users').doc(user.uid).get()
            .then(function(doc) {
              window.AuthState.profile = doc.exists ? doc.data() : null;
              var role = window.AuthState.profile ? window.AuthState.profile.role : 'buyer';
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
                      var data = d.data(); data._id = d.id;
                      window.AuthState.profile._biomassListings.push(data);
                    });
                    if (cb) cb(user, window.AuthState.profile);
                  })
                  .catch(function() { if (cb) cb(user, window.AuthState.profile); });
              } else {
                if (cb) cb(user, window.AuthState.profile);
              }
            })
            .catch(function() {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavListener);
  } else {
    initNavListener();
  }

})();
