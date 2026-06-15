module.exports = {
  apps: [
    {
      name: 'shep-web',
      script: 'dist/src/presentation/cli/index.js',
      args: '_serve --port 4050',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        SHEP_BIND_HOST: '127.0.0.1',
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
    },
  ],
};
