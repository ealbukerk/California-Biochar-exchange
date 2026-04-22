(function () {
  'use strict';

  var BRAND_NAME = 'Verdure Markets';

  var PAGE_CONTEXT = {
    'buyer.html':                { role: 'buyer',  market: 'biochar' },
    'listing.html':              { role: 'buyer',  market: 'biochar' },
    'listings.html':             { role: 'buyer',  market: 'biochar' },
    'feedstock.html':            { role: 'buyer',  market: 'biomass' },
    'feedstock-listing.html':    { role: 'buyer',  market: 'biomass' },
    'producer-demand-browse.html':{ role: 'buyer', market: 'biomass' },
    'what-is-an-aggregator.html': { role: 'buyer', market: 'biomass' },
    'partner-assistance.html':    { role: 'buyer', market: 'biomass' },
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

  function normalizeZip(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '').slice(0, 5);
    return digits.length === 5 ? digits : '';
  }

  function normalizeProfile(profile, user) {
    var normalized = Object.assign({}, profile || {});
    normalized.email = String(normalized.email || (user && user.email) || '').trim();
    normalized.name = String(normalized.name || '').trim();
    normalized.businessName = String(normalized.businessName || '').trim();
    normalized.businessStreet = String(normalized.businessStreet || '').trim();
    normalized.state = String(normalized.state || '').trim();
    normalized.zipcode = normalizeZip(normalized.zipcode);
    normalized.phone = String(normalized.phone || '').trim();
    normalized.businessWebsite = String(normalized.businessWebsite || '').trim();
    normalized.supplierType = normalized.supplierType ? String(normalized.supplierType).trim() : null;
    return normalized;
  }

  function getCurrentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function getDefaultRoute(profileRole) {
    return profileRole === 'seller' ? 'seller.html' : 'buyer.html';
  }

  function getContext(currentPage, profileRole, isSignedIn) {
    if (PAGE_CONTEXT[currentPage]) {
      var pageCtx = PAGE_CONTEXT[currentPage];
      if (pageCtx.market === 'carbon') {
        return { role: isSignedIn ? (profileRole || 'buyer') : 'buyer', market: 'carbon' };
      }
      return { role: pageCtx.role, market: pageCtx.market };
    }
    var savedRole = isSignedIn ? (localStorage.getItem('bm_nav_role') || profileRole || 'buyer') : 'buyer';
    var savedMarket = localStorage.getItem('bm_nav_market') || 'biochar';
    return { role: savedRole, market: savedMarket };
  }

  function navigate(role, market, isSignedIn) {
    var effectiveRole = isSignedIn ? role : 'buyer';
    if (market !== 'carbon') {
      localStorage.setItem('bm_nav_role',   effectiveRole);
      localStorage.setItem('bm_nav_market', market);
    }
    var dest = market === 'carbon'
      ? 'carbon.html'
      : (DEST[effectiveRole] && DEST[effectiveRole][market] ? DEST[effectiveRole][market] : 'buyer.html');
    var currentPage = getCurrentPage();
    if (currentPage !== dest) window.location.href = dest;
  }

  function updateSliders(role, market) {
    var rBuyer  = document.getElementById('bm-role-buyer');
    var rSeller = document.getElementById('bm-role-seller');
    var mBio    = document.getElementById('bm-mkt-biochar');
    var mBio2   = document.getElementById('bm-mkt-biomass');
    var mCarbon = document.getElementById('bm-mkt-carbon');
    if (rBuyer)  rBuyer.classList.toggle('active',  role   === 'buyer');
    if (rSeller) rSeller.classList.toggle('active', role   === 'seller');
    if (mBio)    mBio.classList.toggle('active',    market === 'biochar');
    if (mBio2)   mBio2.classList.toggle('active',   market === 'biomass');
    if (mCarbon) mCarbon.classList.toggle('active', market === 'carbon');
  }

  function buildNav(user, profile) {
    var existing = document.getElementById('bm-nav');
    if (existing) existing.parentNode.removeChild(existing);

    var nav = document.createElement('nav');
    nav.className = 'bm-nav';
    nav.id = 'bm-nav';

    var currentPage = getCurrentPage();
    var profileRole = profile ? profile.role : 'buyer';
    var ctx = getContext(currentPage, profileRole, !!user);
    var role   = ctx.role;
    var market = ctx.market;

    var initial  = profile ? (profile.businessName || profile.name || '') : '';
    var initials = initial ? initial.charAt(0).toUpperCase() : '?';

    nav.innerHTML =
      '<div class="container bm-nav-inner">' +
        '<a class="bm-nav-logo" href="index.html">' + BRAND_NAME + '</a>' +
        '<div class="bm-nav-center">' +
          '<div class="bm-nav-controls">' +
            (user
              ? '<div class="bm-mode-bar bm-mode-bar--role">' +
                  '<button id="bm-role-buyer" class="bm-mode-btn' + (role==='buyer' ? ' active buy' : '') + '">Buyer</button>' +
                  '<button id="bm-role-seller" class="bm-mode-btn' + (role==='seller' ? ' active sell' : '') + '">Seller</button>' +
                '</div>'
              : '') +
            '<div class="bm-mode-bar bm-mode-bar--market">' +
              '<button id="bm-mkt-biochar" class="bm-mode-btn' + (market==='biochar' ? ' active biochar' : '') + '">Biochar</button>' +
              '<button id="bm-mkt-biomass" class="bm-mode-btn' + (market==='biomass' ? ' active biomass' : '') + '">Biomass</button>' +
              '<button id="bm-mkt-carbon" class="bm-mode-btn' + (market==='carbon' ? ' active carbon' : '') + '">Carbon</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bm-nav-right">' +
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

    if (user) {
      document.getElementById('bm-role-buyer').addEventListener('click',  function() { navigate('buyer',  market, true); });
      document.getElementById('bm-role-seller').addEventListener('click', function() { navigate('seller', market, true); });
    }
    document.getElementById('bm-mkt-biochar').addEventListener('click', function() { navigate(role, 'biochar', !!user); });
    document.getElementById('bm-mkt-biomass').addEventListener('click', function() { navigate(role, 'biomass', !!user); });
    document.getElementById('bm-mkt-carbon').addEventListener('click', function() { navigate(role, 'carbon', !!user); });

    if (user) {
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
            var profile = doc.exists ? normalizeProfile(doc.data(), user) : normalizeProfile(null, user);
            buildNav(user, profile);
          })
          .catch(function() { buildNav(user, normalizeProfile(null, user)); });
      } else {
        buildNav(null, null);
      }
    });
  }

  window.AuthState = {
    user: null,
    profile: null,
    getDefaultRoute: getDefaultRoute,
    onReady: function(cb) {
      firebase.auth().onAuthStateChanged(function(user) {
        window.AuthState.user = user;
        if (user) {
          firebase.firestore().collection('users').doc(user.uid).get()
            .then(function(doc) {
              window.AuthState.profile = doc.exists ? normalizeProfile(doc.data(), user) : normalizeProfile(null, user);
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
              var fallbackProfile = normalizeProfile(null, user);
              window.AuthState.profile = fallbackProfile;
              buildNav(user, fallbackProfile);
              if (cb) cb(user, fallbackProfile);
            });
        } else {
          window.AuthState.profile = null;
          buildNav(null, null);
          if (cb) cb(null, null);
        }
      });
    },
    normalizeZip: normalizeZip,
    normalizeProfile: normalizeProfile,
    getProfileZip: function(profile) {
      return normalizeZip(profile && profile.zipcode);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavListener);
  } else {
    initNavListener();
  }

})();
