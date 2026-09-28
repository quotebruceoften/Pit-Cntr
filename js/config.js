/*
 * Deployment configuration.
 *
 * For a customer build, set defaultSite to that customer's site id and
 * lockSite to true: the app then only offers their mine and hides the site
 * picker. A ?site=<id> URL parameter overrides defaultSite when not locked.
 */
(function (root) {
  'use strict';
  root.PitSimConfig = {
    defaultSite: 'navachab',
    lockSite: false
  };
})(typeof self !== 'undefined' ? self : this);
