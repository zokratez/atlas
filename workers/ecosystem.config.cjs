module.exports = {
  apps: [
    {
      name: "atlas-scout",
      cwd: __dirname,
      script: "dist/workers/scout.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-quill",
      cwd: __dirname,
      script: "dist/workers/quill.js",
      interpreter: "node",
      cron_restart: "30 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
