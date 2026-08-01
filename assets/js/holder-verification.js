(() => {
  "use strict";

  const CONTRACT_ADDRESS = "0xFdC6b6B49B71151e813ac2F7A3d07c06BC5B62CB";
  const REQUIRED_CHAIN_ID = "0x38";
  const BALANCE_OF_SELECTOR = "70a08231";
  const DECIMALS = 18n;

  const connectButton = document.getElementById("connect-wallet");
  const switchButton = document.getElementById("switch-network");
  const checkButton = document.getElementById("check-balance");
  const walletAddress = document.getElementById("wallet-address");
  const activeNetwork = document.getElementById("active-network");
  const fateBalance = document.getElementById("fate-balance");
  const verificationResult = document.getElementById("verification-result");
  const statusMessage = document.getElementById("wallet-status");

  let connectedAccount = "";
  let currentChainId = "";

  const setStatus = (message, kind = "info") => {
    statusMessage.textContent = message;
    statusMessage.dataset.kind = kind;
  };

  const resetBalance = () => {
    fateBalance.textContent = "Not checked";
    verificationResult.textContent = "Not verified";
  };

  const shortAddress = (address) =>
    address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "Not connected";

  const networkName = (chainId) => {
    if (!chainId) return "Not detected";
    if (chainId.toLowerCase() === REQUIRED_CHAIN_ID) return "BNB Smart Chain (0x38)";
    return `Unsupported network (${chainId})`;
  };

  const formatUnits = (value) => {
    const divisor = 10n ** DECIMALS;
    const whole = value / divisor;
    const fraction = (value % divisor).toString().padStart(Number(DECIMALS), "0");
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole.toString();
  };

  const updateControls = () => {
    const onRequiredNetwork =
      currentChainId && currentChainId.toLowerCase() === REQUIRED_CHAIN_ID;
    switchButton.hidden = !connectedAccount || onRequiredNetwork;
    checkButton.disabled = !connectedAccount || !onRequiredNetwork;
    walletAddress.textContent = connectedAccount
      ? `${shortAddress(connectedAccount)} (${connectedAccount})`
      : "Not connected";
    activeNetwork.textContent = networkName(currentChainId);
  };

  const getProvider = () => {
    if (!window.ethereum || typeof window.ethereum.request !== "function") {
      throw new Error(
        "No compatible browser wallet was detected. Install a wallet that supports BNB Smart Chain and try again."
      );
    }
    return window.ethereum;
  };

  const readChainId = async () => {
    const provider = getProvider();
    const chainId = await provider.request({ method: "eth_chainId" });
    if (typeof chainId !== "string" || !/^0x[0-9a-f]+$/i.test(chainId)) {
      throw new Error("The wallet returned an invalid network identifier.");
    }
    currentChainId = chainId;
    updateControls();
    return chainId;
  };

  const readBalance = async () => {
    if (!connectedAccount) {
      throw new Error("Connect a wallet before checking a FATE balance.");
    }

    const chainId = await readChainId();
    if (chainId.toLowerCase() !== REQUIRED_CHAIN_ID) {
      resetBalance();
      throw new Error("Switch the wallet to BNB Smart Chain before checking the balance.");
    }

    const normalizedAddress = connectedAccount.toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{40}$/.test(normalizedAddress)) {
      throw new Error("The connected wallet returned an invalid account address.");
    }

    const callData = `0x${BALANCE_OF_SELECTOR}${normalizedAddress.padStart(64, "0")}`;
    const provider = getProvider();
    const response = await provider.request({
      method: "eth_call",
      params: [{ to: CONTRACT_ADDRESS, data: callData }, "latest"],
    });

    if (typeof response !== "string" || !/^0x[0-9a-f]*$/i.test(response)) {
      throw new Error("The blockchain returned a malformed balance response.");
    }

    let balance;
    try {
      balance = BigInt(response);
    } catch {
      throw new Error("The blockchain balance response could not be decoded.");
    }

    fateBalance.textContent = `${formatUnits(balance)} FATE`;
    if (balance > 0n) {
      verificationResult.textContent = "FATE holder verified";
      setStatus("Read-only balance check completed.", "success");
    } else {
      verificationResult.textContent = "No FATE balance detected";
      setStatus("Read-only balance check completed.", "info");
    }
  };

  const handleError = (error, fallbackMessage) => {
    if (error && error.code === 4001) {
      setStatus("The wallet request was rejected.", "error");
      return;
    }

    if (error && error.code === -32002) {
      setStatus("A wallet request is already waiting for a response.", "error");
      return;
    }

    const message =
      error && typeof error.message === "string" ? error.message : fallbackMessage;
    setStatus(message, "error");
  };

  connectButton.addEventListener("click", async () => {
    setStatus("Waiting for wallet connection approval…");
    try {
      const provider = getProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || !accounts[0]) {
        throw new Error("The wallet did not provide an account.");
      }
      connectedAccount = accounts[0];
      await readChainId();
      resetBalance();
      updateControls();

      if (currentChainId.toLowerCase() === REQUIRED_CHAIN_ID) {
        setStatus("Wallet connected. Select “Check FATE balance” to continue.", "success");
      } else {
        setStatus("Wallet connected on the wrong network. Switch to BNB Smart Chain.", "error");
      }
    } catch (error) {
      handleError(error, "The wallet connection could not be completed.");
    }
  });

  switchButton.addEventListener("click", async () => {
    setStatus("Waiting for the network-switch request…");
    try {
      const provider = getProvider();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: REQUIRED_CHAIN_ID }],
      });
      await readChainId();
      resetBalance();
      setStatus("BNB Smart Chain is active. Select “Check FATE balance” to continue.", "success");
    } catch (error) {
      if (error && error.code === 4902) {
        setStatus(
          "BNB Smart Chain is not configured in this wallet. Add it through the wallet’s own network settings, then try again.",
          "error"
        );
        return;
      }
      handleError(error, "The wallet could not switch networks.");
    }
  });

  checkButton.addEventListener("click", async () => {
    setStatus("Reading the FATE balance from BNB Smart Chain…");
    try {
      await readBalance();
    } catch (error) {
      handleError(error, "The FATE balance could not be read.");
    }
  });

  if (window.ethereum && typeof window.ethereum.on === "function") {
    window.ethereum.on("accountsChanged", (accounts) => {
      connectedAccount = Array.isArray(accounts) && accounts[0] ? accounts[0] : "";
      resetBalance();
      updateControls();
      setStatus(
        connectedAccount
          ? "The connected wallet account changed. Check the FATE balance again."
          : "The wallet was disconnected.",
        connectedAccount ? "info" : "error"
      );
    });

    window.ethereum.on("chainChanged", (chainId) => {
      currentChainId =
        typeof chainId === "string" && /^0x[0-9a-f]+$/i.test(chainId) ? chainId : "";
      resetBalance();
      updateControls();
      setStatus(
        currentChainId.toLowerCase() === REQUIRED_CHAIN_ID
          ? "BNB Smart Chain is active. Check the FATE balance again."
          : "The active network changed. BNB Smart Chain is required.",
        currentChainId.toLowerCase() === REQUIRED_CHAIN_ID ? "success" : "error"
      );
    });
  }

  updateControls();
})();
