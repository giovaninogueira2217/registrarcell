module.exports = {
  apps: [
    {
      name: "celulares-api",
      cwd: "./back-end",
      script: "index.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5055,
        DB_FILE: "./data.db",
        CLIENT_DIST_PATH: "/var/www/html/celulares/front/dist"
      }
    },
    {
      name: "celulares-redirector",
      cwd: "./back-end",
      script: "redirector.js",
      watch: false,
      env: {
        REDIRECT_PORT: 5173,
        REDIRECT_TARGET: "https://dhiones.ipsolutiontelecom.com.br/celulares"
      }
    }
  ]
};
