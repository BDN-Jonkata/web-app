import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './appearance.css';
import {AppSettingsProvider} from './AppSettings.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><AppSettingsProvider><App /></AppSettingsProvider></React.StrictMode>
);
