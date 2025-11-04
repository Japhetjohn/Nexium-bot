console.log('[CONFIG] Loading config.js');

export const CONFIG = {
    ETHERSCAN_API_KEY: '9M5C23ZT7GYJI8Y3EGMDGEKTEI55WXQS5C',
    SOLSCAN_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmVhdGVkQXQiOjE3NTY5ODY3MDc4NjksImVtYWlsIjoiZWFzeWdhc3Byb2plY3RAZ21haWwuY29tIiwiYWN0aW9uIjoidG9rZW4tYXBpIiwiYXBpVmVyc2lvbiI6InYyIiwiaWF0IjoxNzU2OTg2NzA3fQ.ZAjzcszGoGZ9p0HWcmdmmLVJzqqs_YNRBkAQALfPFak',
    PROJECT_ID: import.meta.env.VITE_PROJECT_ID,
    QUICKNODE_SOLANA_URL: import.meta.env.VITE_QUICKNODE_SOLANA_URL,
    WALLET_RECEIVE_SOL: import.meta.env.VITE_WALLET_RECEIVE_SOL
};

// Log to verify CONFIG loading
console.log('[CONFIG] Environment variables:', import.meta.env);
console.log('[CONFIG] ETHERSCAN_API_KEY:', CONFIG.ETHERSCAN_API_KEY ? 'Loaded' : 'Not loaded');
console.log('[CONFIG] SOLSCAN_API_KEY:', CONFIG.SOLSCAN_API_KEY ? 'Loaded' : 'Not loaded');
console.log('[CONFIG] PROJECT_ID:', CONFIG.PROJECT_ID ? 'Loaded' : 'Not loaded');
console.log('[CONFIG] QUICKNODE_SOLANA_URL:', CONFIG.QUICKNODE_SOLANA_URL ? 'Loaded' : 'Not loaded');
console.log('[CONFIG] WALLET_RECEIVE_SOL:', CONFIG.WALLET_RECEIVE_SOL ? 'Loaded' : 'Not loaded');