//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ECT is ERC20 {
    uint256 private _totalSupply = 100_000_000_000;

    constructor() ERC20("ERC20 Token", "ECT") {
        _mint(msg.sender, _totalSupply * 10 ** decimals());
    }
}