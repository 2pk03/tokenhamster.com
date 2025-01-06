const { defineConfig } = require('@vue/cli-service');

module.exports = defineConfig({
  transpileDependencies: true,
  chainWebpack: (config) => {
    config.module
      .rule('css') // Target CSS files
      .use('css-loader') // Use the css-loader
      .loader('css-loader')
      .tap((options) => {
        options.url = false; // Disable URL processing
        return options;
      });
  },
});

