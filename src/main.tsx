import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 오류가 나면 흰 화면 대신 안내를 보여 줌
window.onerror = function (message) {
  const root = document.getElementById('root');
  if (root && !root.innerHTML.trim()) {
    root.innerHTML = `
      <div style="padding: 20px; color: #ef4444; font-family: sans-serif; text-align: center;">
        <h2 style="margin-bottom: 10px;">오류가 발생했습니다</h2>
        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">${String(message)}</p>
        <button onclick="location.reload()" style="background: #6d3fe0; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">다시 시도</button>
      </div>`;
  }
  return false;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
