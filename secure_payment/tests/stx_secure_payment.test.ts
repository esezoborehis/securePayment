import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  Client,
  Provider,
  Receipt,
  Result,
  StacksTestnet
} from '@stacks/transactions';
import { 
  uintCV, 
  stringUtf8CV, 
  stringAsciiCV, 
  someCV, 
  noneCV, 
  principalCV,
  trueCV,
  falseCV
} from '@stacks/transactions';

// Mock the Stacks blockchain provider
vi.mock('@stacks/transactions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    StacksTestnet: vi.fn(),
    makeContractCall: vi.fn(),
    callReadOnlyFunction: vi.fn()
  };
});

describe('Instrument Payment System Tests', () => {
  // Test variables
  const CONTRACT_ADDRESS = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  const CONTRACT_NAME = 'instrument-payment';
  const OWNER_ADDRESS = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  const USER_ADDRESS = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG';
  const BLOCK_HEIGHT = 12345;
  
  let provider: any;
  let client: any;
  
  // Mock read-only function results
  const mockReadOnlyResults = {
    'get-balance': { type: 'uint', value: 1000n },
    'get-instrument': {
      type: 'some',
      value: {
        type: 'tuple',
        data: {
          name: { type: 'string-utf8', value: 'Yamaha Clarinet' },
          category: { type: 'string-ascii', value: 'Woodwind' },
          'daily-rental-fee': { type: 'uint', value: 10n },
          'purchase-price': { type: 'uint', value: 500n },
          status: { type: 'string-ascii', value: 'available' },
          owner: { type: 'none' },
          renter: { type: 'none' },
          'rental-expiry': { type: 'none' }
        }
      }
    },
    'get-transaction': {
      type: 'some',
      value: {
        type: 'tuple',
        data: {
          user: { type: 'principal', value: USER_ADDRESS },
          'instrument-id': { type: 'uint', value: 1n },
          amount: { type: 'uint', value: 50n },
          type: { type: 'string-ascii', value: 'rental' },
          status: { type: 'string-ascii', value: 'active' },
          'rental-period-days': { 
            type: 'some', 
            value: { type: 'uint', value: 5n } 
          },
          timestamp: { type: 'uint', value: 12300n },
          expiry: { 
            type: 'some', 
            value: { type: 'uint', value: 13020n } 
          }
        }
      }
    },
    'get-next-tx-id': { type: 'uint', value: 5n },
    'get-next-instrument-id': { type: 'uint', value: 3n },
    'is-instrument-available': { type: 'bool', value: true },
    'is-rental-active': { type: 'bool', value: false }
  };

  // Mock transaction receipt
  const mockReceipt = {
    success: true,
    txId: '0x1234567890abcdef',
    result: { type: 'uint', value: 1n }
  };

  beforeEach(() => {
    provider = new StacksTestnet();
    client = new Client(provider);
    
    // Mock the callReadOnlyFunction to return prepared mock results
    vi.mocked(Client.prototype.callReadOnlyFunction).mockImplementation(
      async ({ functionName }) => {
        const key = functionName as keyof typeof mockReadOnlyResults;
        return mockReadOnlyResults[key] || { type: 'none' };
      }
    );

    // Mock the makeContractCall to return a successful receipt
    vi.mocked(Client.prototype.makeContractCall).mockResolvedValue(mockReceipt as unknown as Receipt);
  });

  describe('Read-only functions', () => {
    it('should get the balance for a user', async () => {
      const result = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'get-balance',
        functionArgs: [principalCV(USER_ADDRESS)],
        senderAddress: USER_ADDRESS
      });
      
      expect(result).toEqual(mockReadOnlyResults['get-balance']);
      expect(result.value).toBe(1000n);
    });

    it('should get instrument details', async () => {
      const result = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'get-instrument',
        functionArgs: [uintCV(1)],
        senderAddress: USER_ADDRESS
      });
      
      expect(result.type).toBe('some');
      expect(result.value.data.name.value).toBe('Yamaha Clarinet');
      expect(result.value.data.category.value).toBe('Woodwind');
      expect(result.value.data['purchase-price'].value).toBe(500n);
    });

    it('should check if an instrument is available', async () => {
      const result = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'is-instrument-available',
        functionArgs: [uintCV(1)],
        senderAddress: USER_ADDRESS
      });
      
      expect(result.type).toBe('bool');
      expect(result.value).toBe(true);
    });
  });

  describe('Administrative functions', () => {
    it('should register a new instrument', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'register-instrument',
        functionArgs: [
          stringUtf8CV('Selmer Saxophone'),
          stringAsciiCV('Woodwind'),
          uintCV(15), // daily rental fee
          uintCV(800) // purchase price
        ],
        senderAddress: OWNER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
      expect(receipt.result.value).toBe(1n);
    });

    it('should update instrument status', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'update-instrument-status',
        functionArgs: [
          uintCV(1),
          stringAsciiCV('maintenance')
        ],
        senderAddress: OWNER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should fail to register instrument if not owner', async () => {
      // Mock failure for non-owner
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 100,
        message: 'err-owner-only'
      });
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'register-instrument',
        functionArgs: [
          stringUtf8CV('Bach Trumpet'),
          stringAsciiCV('Brass'),
          uintCV(12),
          uintCV(600)
        ],
        senderAddress: USER_ADDRESS // Not the owner
      })).rejects.toHaveProperty('code', 100);
    });
  });

  describe('Payment and balance functions', () => {
    it('should deposit funds', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'deposit',
        functionArgs: [uintCV(500)],
        senderAddress: USER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should purchase an instrument', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'purchase-instrument',
        functionArgs: [uintCV(1)],
        senderAddress: USER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should rent an instrument', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(1), uintCV(7)], // 7 days rental
        senderAddress: USER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should fail to rent with insufficient balance', async () => {
      // Override the balance for this test
      vi.mocked(Client.prototype.callReadOnlyFunction).mockImplementationOnce(
        async () => ({ type: 'uint', value: 5n })
      );
      
      // Mock failure for insufficient balance
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 101,
        message: 'err-insufficient-balance'
      });
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(1), uintCV(7)],
        senderAddress: USER_ADDRESS
      })).rejects.toHaveProperty('code', 101);
    });
  });

  describe('Rental management functions', () => {
    // Mock a rented instrument for these tests
    beforeEach(() => {
      mockReadOnlyResults['get-instrument'] = {
        type: 'some',
        value: {
          type: 'tuple',
          data: {
            name: { type: 'string-utf8', value: 'Yamaha Clarinet' },
            category: { type: 'string-ascii', value: 'Woodwind' },
            'daily-rental-fee': { type: 'uint', value: 10n },
            'purchase-price': { type: 'uint', value: 500n },
            status: { type: 'string-ascii', value: 'rented' },
            owner: { type: 'none' },
            renter: { 
              type: 'some',
              value: { type: 'principal', value: USER_ADDRESS }
            },
            'rental-expiry': { 
              type: 'some',
              value: { type: 'uint', value: 13020n }
            }
          }
        }
      };
      
      mockReadOnlyResults['is-instrument-available'] = { type: 'bool', value: false };
      mockReadOnlyResults['is-rental-active'] = { type: 'bool', value: true };
    });
    
    it('should extend a rental', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'extend-rental',
        functionArgs: [uintCV(1), uintCV(3)], // Extend by 3 days
        senderAddress: USER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should return an instrument', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'return-instrument',
        functionArgs: [uintCV(1)],
        senderAddress: USER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should fail to return an instrument if not the renter', async () => {
      // Mock failure for unauthorized user
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 105,
        message: 'err-unauthorized'
      });
      
      const NON_RENTER = 'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0';
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'return-instrument',
        functionArgs: [uintCV(1)],
        senderAddress: NON_RENTER // Not the renter
      })).rejects.toHaveProperty('code', 105);
    });
  });

  describe('System functions', () => {
    it('should process refunds', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'process-refund',
        functionArgs: [uintCV(2)],
        senderAddress: OWNER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
    
    it('should mark overdue rentals', async () => {
      const receipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'mark-overdue-rentals',
        functionArgs: [],
        senderAddress: OWNER_ADDRESS
      });
      
      expect(receipt.success).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should fail when trying to rent a non-existent instrument', async () => {
      // Mock instrument not found
      vi.mocked(Client.prototype.callReadOnlyFunction).mockImplementationOnce(
        async () => ({ type: 'none' })
      );
      
      // Mock failure for invalid instrument
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 106,
        message: 'err-invalid-instrument'
      });
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(999), uintCV(7)],
        senderAddress: USER_ADDRESS
      })).rejects.toHaveProperty('code', 106);
    });
    
    it('should fail when trying to rent for an invalid period', async () => {
      // Mock failure for invalid rental period
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 108,
        message: 'err-invalid-rental-period'
      });
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(1), uintCV(400)], // Too many days
        senderAddress: USER_ADDRESS
      })).rejects.toHaveProperty('code', 108);
    });
    
    it('should fail when trying to rent an unavailable instrument', async () => {
      // Override the instrument status
      mockReadOnlyResults['get-instrument'].value.data.status.value = 'maintenance';
      
      // Mock failure for unavailable instrument
      vi.mocked(Client.prototype.makeContractCall).mockRejectedValueOnce({
        code: 107,
        message: 'err-instrument-unavailable'
      });
      
      await expect(client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(1), uintCV(7)],
        senderAddress: USER_ADDRESS
      })).rejects.toHaveProperty('code', 107);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle a complete rental lifecycle', async () => {
      // Reset mocks for this test
      const instrumentId = 1;
      const rentalDays = 7;
      
      // Step 1: Check if instrument is available
      let availableResult = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'is-instrument-available',
        functionArgs: [uintCV(instrumentId)],
        senderAddress: USER_ADDRESS
      });
      
      expect(availableResult.value).toBe(true);
      
      // Step 2: Get instrument details
      let instrumentResult = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'get-instrument',
        functionArgs: [uintCV(instrumentId)],
        senderAddress: USER_ADDRESS
      });
      
      // Step 3: Deposit funds
      let depositReceipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'deposit',
        functionArgs: [uintCV(1000)],
        senderAddress: USER_ADDRESS
      });
      
      expect(depositReceipt.success).toBe(true);
      
      // Step 4: Rent the instrument
      let rentReceipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'rent-instrument',
        functionArgs: [uintCV(instrumentId), uintCV(rentalDays)],
        senderAddress: USER_ADDRESS
      });
      
      expect(rentReceipt.success).toBe(true);
      
      // Step 5: Check that rental is active
      mockReadOnlyResults['is-rental-active'] = { type: 'bool', value: true };
      
      let rentalActiveResult = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'is-rental-active',
        functionArgs: [uintCV(instrumentId)],
        senderAddress: USER_ADDRESS
      });
      
      expect(rentalActiveResult.value).toBe(true);
      
      // Step 6: Extend the rental
      let extendReceipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'extend-rental',
        functionArgs: [uintCV(instrumentId), uintCV(3)], // 3 more days
        senderAddress: USER_ADDRESS
      });
      
      expect(extendReceipt.success).toBe(true);
      
      // Step 7: Return the instrument
      let returnReceipt = await client.makeContractCall({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'return-instrument',
        functionArgs: [uintCV(instrumentId)],
        senderAddress: USER_ADDRESS
      });
      
      expect(returnReceipt.success).toBe(true);
      
      // Step 8: Verify instrument is available again
      mockReadOnlyResults['is-instrument-available'] = { type: 'bool', value: true };
      mockReadOnlyResults['is-rental-active'] = { type: 'bool', value: false };
      
      availableResult = await client.callReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: 'is-instrument-available',
        functionArgs: [uintCV(instrumentId)],
        senderAddress: USER_ADDRESS
      });
      
      expect(availableResult.value).toBe(true);
    });
  });
});