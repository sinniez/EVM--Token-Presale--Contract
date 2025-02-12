// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./ECT.sol";

/**
 * @title Presale contract
 * @notice Create and manage presales of ECT token
 */
contract Presale is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Stable coin address and Uniswap v2 router address on Ethereum mainnet and Ethereum Sepolia testnet
    address private immutable USDT =
        block.chainid == 1
            ? 0xdAC17F958D2ee523a2206206994597C13D831ec7 // Checksummed address for mainnet USDT
            : 0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0; // Checksummed address for sepolia USDT

    address private immutable USDC =
        block.chainid == 1
            ? 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 // Checksummed address for mainnet USDC
            : 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8; // Checksummed address for sepolia USDC

    address private immutable DAI =
        block.chainid == 1
            ? 0x6B175474E89094C44Da98b954EedeAC495271d0F // Checksummed address for Mainnet DAI
            : 0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357; // Checksummed address for Sepolia DAI

    address private immutable ROUTER =
        block.chainid == 1
            ? 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D // Mainnet Uniswap V2
            : 0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008; // Sepolia Uniswap V2

    ///@dev MULTISIGWALLET address
    address private immutable MULTISIG_WALLET_ADDRESS = 0x0000000000000000000000000000000000000000;  //Pre-defined multisig wallet address

    /// @dev owner address
    address private _owner;

    /// @dev Token Interfaces
    ECT public immutable token;
    IERC20 public immutable USDTInterface = IERC20(USDT);
    IERC20 public immutable USDCInterface = IERC20(USDC);
    IERC20 public immutable DAIInterface = IERC20(DAI);
    IUniswapV2Router02 public immutable router = IUniswapV2Router02(ROUTER);

    /// @dev presale parameters
    uint256 public softcap;
    uint256 public hardcap;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public claimTime;
    uint256 public presaleSupply;

    /// @dev Total tokens sold in presale
    uint256 public totalTokensSold;

    /// @dev Amount of funds raised from Presale
    uint256 public fundsRaised;

    /// @dev wallet account for raising funds.
    address public wallet;

    /// @dev Tracks investors
    address[] public investors;

    /// @dev Tracks early investors who invested before reaching softcap. Unsold tokens will be distributed pro-rata to early investors
    address[] public earlyInvestors;

    /// @dev Define thresholds of token amount and prices
    uint256[] public thresholds;
    uint256[] public prices;

    /// @dev Tracks contributions of investors, how the investors invest with which coin
    mapping(address => mapping(address => uint256)) public investments;

    /// @dev Tracks token amount of investors
    mapping(address => uint256) public investorTokenBalance;

    /// @dev Tracks early investors
    mapping(address => bool) private earlyInvestorsMapping;

    /**
     * @dev event for token is bought
     * @param buyer buyer who bought token
     * @param tokensBought   the bought token amount
     * @param amountPaid the amount of payment user spent for buying token
     * @param timestamp  At specific time who buy tx occured
     */
    event TokensBought(
        address indexed buyer,
        uint256 indexed tokensBought,
        uint256 indexed amountPaid,
        uint256 timestamp
    );

    /// @dev event for refunding all funds
    event FundsRefunded(
        address indexed caller,
        uint256 indexed fundsAmount,
        uint256 timestamp
    );

    /// @dev event for claimaing tokens
    event TokensClaimed(address indexed caller, uint256 indexed tokenAmount);

    /// @dev event for updating wallet address for withdrawing contract balance
    event WalletUpdated(address indexed oldWallet, address indexed newWallet);

    /// @dev event for setting claim time
    event ClaimTimeUpdated(
        uint256 indexed oldClaimTime,
        uint256 indexed newClaimTime
    );

    /// @dev event for transferring ownership
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev validate if address is non-zero
    modifier notZeroAddress(address address_) {
        require(address_ != address(0), "Invalid address");
        _;
    }

    /// @dev validate presale startTime and endTime is valid
    modifier isFuture(uint256 startTime_, uint256 duration_) {
        require(startTime_ >= block.timestamp, "Invalid start time");
        require(duration_ > 0, "Invalid duration");
        _;
    }

    /// @dev validate softcap & hardcap setting
    modifier capSettingValid(uint256 softcap_, uint256 hardcap_) {
        require(softcap_ > 0, "Invalid softcap");
        require(hardcap_ > softcap_, "Invalid hardcap");
        _;
    }

    /// @dev validate if user can purchase certain amount of tokens at timestamp.
    modifier checkSaleState(uint256 tokenAmount_) {
        require(
            block.timestamp >= startTime && block.timestamp <= endTime,
            "Invalid time for buying the token."
        );

        uint256 _tokensAvailable = tokensAvailable();

        require(
            tokenAmount_ <= _tokensAvailable && tokenAmount_ > 0,
            "Exceeds available tokens"
        );
        _;
    }

    /// @dev validate if user is owner or not.
    modifier onlyOwner() {
        if (msg.sender != _owner) {
            revert NotOwner(); // Revert with custom error
        }
        _;
    }

    //Define a custom error for not being the owner
    error NotOwner();

    /**
     * @dev constructor for presale
     * @param softcap_ softcap for Presale, // 500,000
     * @param hardcap_ hardcap for Presale, // 1,000,000
     * @param startTime_ Presale start time, // 1662819200000
     * @param duration_ Presale duration, // 1762819200000
     * @param tokenAddress_ deployed ECT token address, // 0x810fa...
     * @param presaleTokenPercent_  ECT Token allocation percent for Presale, // 10%
     */
    constructor(
        uint256 softcap_,
        uint256 hardcap_,
        uint256 startTime_,
        uint256 duration_,
        address tokenAddress_,
        uint8 presaleTokenPercent_
    )
        capSettingValid(softcap_, hardcap_)
        notZeroAddress(tokenAddress_)
        isFuture(startTime_, duration_)
    {
        _owner = msg.sender;
        softcap = softcap_;
        hardcap = hardcap_;
        startTime = startTime_;
        endTime = startTime_ + duration_;

        token = ECT(tokenAddress_);
        presaleSupply = (token.totalSupply() * presaleTokenPercent_) / 100;

        // Initialize the thresholds and prices
        thresholds = [
            3_000_000_000 * 10 ** 18,
            7_000_000_000 * 10 ** 18,
            9_000_000_000 * 10 ** 18,
            presaleSupply
        ];
        prices = [80, 100, 120, 140]; // token price has 6 decimals.
    }

    /**
     * @dev transfer tokens from token contract to presale contract
     * @param presaleSupplyAmount_ amount of tokens for presale
     */
    function transferTokensToPresale(
        uint256 presaleSupplyAmount_
    ) public onlyOwner returns (bool) {
        require(presaleSupplyAmount_ > 0, "Amount must be greater than zero");
        require(
            token.balanceOf(msg.sender) >= presaleSupplyAmount_,
            "Insufficient balance"
        );
        require(block.timestamp < startTime, "Presale has already started");

        //Send the tokens to the presale contract
        SafeERC20.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            presaleSupplyAmount_
        );
        return true;
    }

    /**
     * @dev Internal functions to purchase ECT token with Stable Coin like USDT, USDC, DAI
     * @param coin_ The stablecoin interface being used
     * @param tokenAmount_ ECT token amount users willing to buy with Stable Coin
     */
    function _buyWithCoin(
        IERC20 coin_,
        uint256 tokenAmount_
    ) internal checkSaleState(tokenAmount_) whenNotPaused nonReentrant {
        uint256 _coinAmount = estimatedCoinAmountForTokenAmount(
            tokenAmount_,
            coin_
        );
        uint8 _coinDecimals = getCoinDecimals(coin_);

        //Check allowances and balances
        require(
            _coinAmount <= coin_.allowance(msg.sender, address(this)),
            "Insufficient allowance"
        );
        require(
            _coinAmount <= coin_.balanceOf(msg.sender),
            "Insufficient balance."
        );

        // Private code for buying tokens

        //Emit the event for tokenns bought
        emit TokensBought(
            msg.sender,
            tokenAmount_,
            _coinAmount,
            block.timestamp
        );
    }

    /**
     * @dev buy token with USDT
     * @param tokenAmount_ token amount
     */
    function buyWithUSDT(uint256 tokenAmount_) external whenNotPaused {
        _buyWithCoin(USDTInterface, tokenAmount_);
    }

    /**
     * @dev buy token with USDC
     * @param tokenAmount_ token amount
     */
    function buyWithUSDC(uint256 tokenAmount_) external whenNotPaused {
        _buyWithCoin(USDCInterface, tokenAmount_);
    }

    /**
     * @dev buy token with DAI
     * @param tokenAmount_ token amount
     */
    function buyWithDAI(uint256 tokenAmount_) external whenNotPaused {
        _buyWithCoin(DAIInterface, tokenAmount_);
    }

    /**
     * @dev Helper function to update investor records
     */
    function _updateInvestorRecords(
        address investor_,
        uint256 tokenAmount_,
        IERC20 coin_,
        uint256 coinAmount_
    ) private {
        //Private code to update investor records
    }

    /**
     * @dev Helper function to update presale statistics
     */
    function _updatePresaleStats(
        uint256 tokenAmount_,
        uint256 coinAmount_,
        uint8 coinDecimals_
    ) private {
        //Private code to update presale statistics
    }

    /**
     * @dev Helper function to calculate the token amount available with coin (like usdt, usdc, dai)
     * @param coinAmount_ coin (like usdt, usdc, dai) amount
     * @param coin_ coin type
     * @return _tokenAmount calculated token amount
     */
    function estimatedTokenAmountAvailableWithCoin(
        uint256 coinAmount_,
        IERC20 coin_
    ) public view returns (uint256) {
        //Private code to calculate the token amount available with coin (like usdt, usdc, dai)
    }

    /**
     * @dev Helper function to calculate coin amount for buying a certain amount of tokens. When user inputs tokenAmount and corresponding coinAmount is shown automatically
     * Takes into consideration price thresholds and returns the total coin amount needed.
     * @param tokenAmount_ token amount
     * @param coin_ stable coin type
     * @return _coinAmount calculated coin amount
     */
    function estimatedCoinAmountForTokenAmount(
        uint256 tokenAmount_,
        IERC20 coin_
    ) public view returns (uint256) {}

    /**
     * @dev buy token with ETH
     */
    function buyWithETH() external payable whenNotPaused nonReentrant {
        require(
            block.timestamp >= startTime && block.timestamp <= endTime,
            "Invalid time for buying the token"
        );

        //Private code to calculate estimated token amount and available coin amount

        require(
            _estimatedTokenAmount <= _tokensAvailable &&
                _estimatedTokenAmount > 0,
            "Invalid token amount to buy"
        );

        //Private function to buy token with ETH

        emit TokensBought(
            msg.sender,
            _tokenAmount,
            _usdtAmount,
            block.timestamp
        );
    }

    /**
     * @dev Helper funtion to calculate the token amount available with eth
     * @param ethAmount_ eth Amount
     * @return _tokenAmount calculated token amount
     */
    function estimatedTokenAmountAvailableWithETH(
        uint256 ethAmount_
    ) public view returns (uint256) {
        //Private code to calculate token amount available with eth
    }

    /**
     * @dev Helper funtion to calculate eth amount for buying certain amount of token
     * @param tokenAmount_ token amount
     * @return _ethAmount calculated eth amount
     */
    function estimatedEthAmountForTokenAmount(
        uint256 tokenAmount_
    ) public view returns (uint256) {
        //Private code to calculate eth amount for buying certain amount of token
    }

    /**
     * @dev If the Presale fails to reach the soft cap before the end of the self-set time, all funds will be refunded to investors.
     * @dev Only owner call refund raised money.
     */
    function refund() external onlyOwner nonReentrant {
        require(
            block.timestamp > endTime,
            "Cannot refund because presale is still in progress."
        );
        require(fundsRaised < softcap, "Softcap reached, refund not available");

       // Private Code for Refund the funds to the investors

        fundsRaised = 0;
        delete investors;
    }

    /**
     * @dev Withdraw raised funds to wallet, if presale ends.
     * @dev only owner can withdraw
     */
    function withdraw() external onlyOwner nonReentrant {
        require(
            block.timestamp > endTime,
            "Cannot withdraw because presale is still in progress."
        );

        require(wallet != address(0), "Wallet not set");

        require(
            fundsRaised > softcap,
            "Can not withdraw as softcap not reached."
        );

        // Private code that Transfer the funds to the wallet
    }

    /**
     * @dev claim ECT tokens after presale is finished
     * @param investor_ user claiming ECT tokens after sale
     */
    function claim(address investor_) external nonReentrant {
        require(
            block.timestamp > claimTime && claimTime > 0,
            "It's not claiming time yet."
        );

        require(
            fundsRaised >= softcap,
            "Can not claim as softcap not reached. Instead you can be refunded."
        );

        // Private code that Users can claim their tokens after the presale ends

        emit TokensClaimed(investor_, _tokenAmountforUser);
    }

    /**
     * @dev Helper funtion to set the multisig wallet address for withdrawing funds
     */
    function setWallet(
        address wallet_
    ) external onlyOwner notZeroAddress(wallet_) {
        require(
            block.timestamp > endTime,
            "Presale is still ongoing. You can only set wallet after presale is finished."
        );
        require(
            wallet_ == MULTISIG_WALLET_ADDRESS,
            "Only approved multisig allowed"
        );
        address oldWallet = wallet;
        wallet = wallet_;
        emit WalletUpdated(oldWallet, wallet_);
    }

    /**
     * @dev Helper funtion to set the claim time
     */
    function setClaimTime(uint256 claimTime_) external onlyOwner {
        require(claimTime_ > endTime, "Presale is still ongoing.");
        require(
            claimTime_ < endTime + 365 days,
            "Claim time too far in future"
        );
        require(
            fundsRaised > softcap,
            "Can not set claim time as softcap not reached."
        );
        uint256 oldClaimTime = claimTime;
        claimTime = claimTime_;
        emit ClaimTimeUpdated(oldClaimTime, claimTime_);
    }

    /**
     * @dev Helper funtion to get raised fund
     */
    function getFundsRaised() external view returns (uint256) {
        return fundsRaised;
    }

    /**
     * @dev Helper funtion to get the investor's bought token amount
     * @param investor_ Investor address
     */
    function getTokenAmountForInvestor(
        address investor_
    ) public view returns (uint256) {
        return investorTokenBalance[investor_];
    }

    /**
     * @dev Helper funtion to get current user's investments
     * @param investor_ user address
     * @param coin_ coin Interface
     */
    function getInvestments(
        address investor_,
        IERC20 coin_
    ) external view returns (uint256) {
        return investments[investor_][address(coin_)];
    }

    /**
     * @dev Helper funtion to get all investors
     */
    function getInvestors() external view returns (address[] memory) {
        return investors;
    }

    /**
     * @dev Helper funtion to get early investors
     */
    function getEarlyInvestors() external view returns (address[] memory) {
        return earlyInvestors;
    }

    /**
     * @dev Helper funtion to check if user is whitelisted on early Inestors
     * @param investor_ Investor address to check
     */
    function isEarlyInvestors(address investor_) public view returns (bool) {
        return earlyInvestorsMapping[investor_];
    }

    /**
     * @dev Helper funtion to get remaining tokens available for presale
     * @return amount token balance as uint256 with decimals of 18
     */
    function tokensAvailable() public view returns (uint256) {
        return presaleSupply - totalTokensSold;
    }

    /**
     * @dev Helper funtion to get bonus token amount after presale ends.
     * @return _bonusTokenAmount bonus token amount
     */
    function getBonusTokenAmount() public view returns (uint256) {
        require(block.timestamp > endTime, "presale is still in progress");
        uint256 remainingTokens = presaleSupply - totalTokensSold;
        uint256 earlyInvestorCount = earlyInvestors.length;
        return
            earlyInvestorCount > 0 ? remainingTokens / earlyInvestorCount : 0;
    }

    /**
     * @dev Helper funtion to get current token price for presale
     * @return uint256
     */
    function getCurrentTokenPriceForIndex(
        uint8 index_
    ) internal view returns (uint256) {
        require(index_ < prices.length, "Invalid tier index");
        return prices[index_];
    }

    /**
     * @dev Helper funtion to get remaining tokens for increasing token price
     * @return remainingTokenAmountForIncreasedPrice
     */
    function getRemainingTokenAmountForIncreasingPrice()
        external
        view
        returns (uint256)
    {
        // Calculate remaining tokens based on totalTokensSold
        for (uint8 i = 0; i < thresholds.length; i++) {
            if (totalTokensSold <= thresholds[i]) {
                return thresholds[i] - totalTokensSold;
            }
        }

        return 0; // Return 0 if all tokens are sold
    }

    /**
     * @dev Helper funtion to calculate remaining times left for presale start
     */
    function getRemainingTimeForPresaleStart() external view returns (uint256) {
        return block.timestamp >= startTime ? 0 : startTime - block.timestamp;
    }

    /**
     * @dev Helper funtion to calculate remaining times left for presale end
     */
    function getRemainingTimeForPresaleEnd() external view returns (uint256) {
        return block.timestamp >= endTime ? 0 : endTime - block.timestamp;
    }

    /**
     * @dev Helper funtion to calculate remaining times left for claim start, if claim time is not set returns 864000000000000, which is not possible to reach and returns 0 if claim time passed
     */
    function getRemainingTimeForClaimStart() external view returns (uint256) {
        return
            claimTime > 0
                ? (
                    block.timestamp >= claimTime
                        ? 0
                        : claimTime - block.timestamp
                )
                : 864000000000000;
    }

    /**
     * @dev Helper funtion to get coin decimals
     * @param coin_ IERC20 interface
     */
    function getCoinDecimals(IERC20 coin_) internal view returns (uint8) {
        return coin_ == DAIInterface ? 18 : 6;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner_) public virtual onlyOwner {
        require(
            newOwner_ != address(0),
            "Ownable: new owner is the zero address"
        );
        address oldOwner = _owner;
        _owner = newOwner_;
        emit OwnershipTransferred(oldOwner, newOwner_);
    }

    /**
     * @dev Helper function to return current owner
     */
    function getOwner() public view returns (address) {
        return _owner;
    }

    receive() external payable {}
    fallback() external payable {}
}
