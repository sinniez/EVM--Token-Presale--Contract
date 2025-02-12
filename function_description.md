# Function Description
This document lists the sequence of function call for owner and investor.

## WRITE FUNCTIONS

### Owner
These functions are only called by the owner. 

#### At anytime

- Transfer ownership
```bash 
  function transferOwnership(address newOwner_) public virtual onlyOwner {}
```    

#### Before Presale Starts

- Transfer tokens before presale starts, but can't transfer once presale starts
```bash
 function transferTokensToPresale(uint256 presaleSupplyAmount_) public onlyOwner {}
```

#### After Presale Ends

- Set wallet address (checks if non-zero address) to recieve raised money for withdraw.
```bash
  function setWallet(address wallet_) external onlyOwner notZeroAddress(wallet_) {}
```

- Set claim time for users claim tokens if softcap reached.
```bash
  function setClaimTime(uint256 claimTime_) external onlyOwner {}
```

- Withdraw raised money to wallet if softcap reached.
```bash
  function withdraw() external onlyOwner nonReentrant {}
```

- Refund raised money to investors if softcap not reached.
```bash
  function refund() external onlyOwner nonReentrant {}
```


### Investor
These functions are only called by the investor.

#### Before Presale Starts

#### On Presale Period

- Buy tokens with USDT
```bash
  function buyWithUSDT(uint256 tokenAmount_) external whenNotPaused {}
```

- Buy tokens with USDC
```bash
  function buyWithUSDC(uint256 tokenAmount_) external whenNotPaused {}
```

- Buy tokens with DAI
```bash
  function buyWithDAI(uint256 tokenAmount_) external whenNotPaused {}
```

- Buy tokens with ETH
```bash
  function buyWithETH() external payable whenNotPaused nonReentrant {}
```

#### After Presale Ends and sets claim time

- Claim tokens if softcap reached.
```bash
  function claim(address user_) external nonReentrant {}
```


## HELPER FUNCTIONS

- Calculate token amount available with coin (like usdt, usdc, and dai) based on coin amount.
```bash
  function estimatedTokenAmountAvailableWithCoin(uint256 coinAmount_, IERC20 coin_) public view returns (uint256) {}
```

- Calculate coin amount for buying certain amount of tokens.
```bash
  function estimatedCoinAmountForTokenAmount(uint256 tokenAmount_, IERC20 coin_) public view returns (uint256) {}
```

- Calculate token amount available with ETH based on ETH amount.
```bash
  function estimatedTokenAmountAvailableWithETH(uint256 ethAmount_) public view returns (uint256) {}
```

- Calculate ETH amount for buying certain amount of tokens.
```bash
 function estimatedEthAmountForTokenAmount(uint256 tokenAmount_) public view returns (uint256) {}
```

- Get funds raised during presale.
```bash
  function getFundsRaised() external view returns (uint256) {}
```

- Get token amount for each investor.
```bash
  function getTokenAmountForInvestor(address from_) public view returns (uint256) {}
```

- Get investments for each investor with what coin.
```bash
  function getInvestments(address user_, IERC20 coin_) external view returns (uint256) {}
```

- Get investors list
```bash
  function getInvestors() external view returns (address[] memory) {}
```

- Get early investors list
```bash
  function getEarlyInvestors() external view returns (address[] memory) {}
```

- Checks if user is early investor or not
```bash
  function isEarlyInvestors(address user_) public view returns (bool) {}
```

- Get available tokens for buying in presale.
```bash
  function tokensAvailable() public view returns (uint256) {}
```

- Get Bonus token amount for distributing to early investors after presale ends.
```bash
  function getBonusTokenAmount() public view returns (uint256) {}
```

- Calculate remaining time for presale.
```bash
  function getRemainingTime() public view returns (uint256) {}
```

- Get remaining token amount for increasing price in presale.
```bash
  function getRemainingTokenAmountForIncreasingPrice() external view returns (uint256) {}
``` 

- Get presale start time
```bash
  function getPresaleStartTime() external view returns (uint256) {}
```

- Get owner address
```bash
  function getOwner() public view returns (address) {}
``` 