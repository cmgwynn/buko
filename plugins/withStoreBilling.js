const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withStoreBilling(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    const activity = application?.activity?.find((item) => item.$['android:name'] === '.MainActivity');
    if (!activity) throw new Error('Buko billing plugin could not find MainActivity.');
    activity.$['android:launchMode'] = 'singleTop';
    return result;
  });
};
