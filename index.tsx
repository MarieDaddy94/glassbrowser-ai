import React from 'react';
import ReactDOM from 'react-dom/client';
import SystemBoot from './components/SystemBoot';
import ErrorBoundary from './components/ErrorBoundary';
import '@fontsource/inter/index.css';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <SystemBoot />
    </ErrorBoundary>
  </React.StrictMode>
);
