const env = {
  API_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  WS_URL: import.meta.env.VITE_WS_BASE_URL || `ws://${window.location.host}/api/v1/telemetry/ws`,
  MQTT_URL: import.meta.env.VITE_MQTT_BROKER_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8083/mqtt`,
  MAP_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN || '',
  APP_NAME: import.meta.env.VITE_APP_NAME || 'AeroCommand',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL || 'touati.oussama@esprit.tn',
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
};

export default env;

