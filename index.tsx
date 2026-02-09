import React from 'react';
import ReactDOM from 'react-dom/client';
import SystemBoot from './components/SystemBoot';
import '@fontsource/inter/index.css';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SystemBoot />
  </React.StrictMode>
);
