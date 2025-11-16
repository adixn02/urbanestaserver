import axios from 'axios';
import logger from '../utils/logger.js';

class TwoFactorService {
  constructor() {
    this.baseUrl = 'https://2factor.in/API/V1';
  }

  getApiKey() {
    // Ensure environment variables are loaded
    if (!process.env.TWO_FACTOR_API_KEY) {
      logger.error('2Factor API key not found in environment variables');
      throw new Error('2Factor API key is required. Please check your environment configuration.');
    }
    
    const apiKey = process.env.TWO_FACTOR_API_KEY.trim();
    if (!apiKey || apiKey.length < 10) {
      logger.error('2Factor API key appears to be invalid or too short');
      throw new Error('Invalid 2Factor API key. Please check your environment configuration.');
    }
    
    return apiKey;
  }

  /**
   * Send OTP to phone number - SMS only using approved DLT template
   * # Fixed 2Factor SMS OTP issue (Urbanesta_Realtors template)
   * Template: Urbanesta_Realtors | Sender ID: SLVECH
   * @param {string} phoneNumber - Phone number with country code (e.g., "919876543210")
   * @returns {Promise<Object>} - Response with sessionId
   */
  async sendOTP(phoneNumber) {
    try {
      // Validate input
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        throw new Error('Phone number is required and must be a string');
      }

      // Format phone number for 2Factor API (with + prefix for AUTOGEN3)
      const apiFormattedPhone = this.formatPhoneForAPI(phoneNumber);
      // Format phone number for database storage (with + prefix)
      const dbFormattedPhone = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`Attempting to send SMS OTP to phone: ${apiFormattedPhone} (DB format: ${dbFormattedPhone})`);
      
      // Send SMS using approved template - NO VOICE FALLBACK
      // Using AUTOGEN3 ensures SMS-only delivery with approved DLT template
      const smsResult = await this.sendSMSOTP(apiFormattedPhone);
      
      if (smsResult.success) {
        logger.info(`SMS OTP sent successfully to ${apiFormattedPhone}, sessionId: ${smsResult.sessionId}`);
        return {
          success: true,
          sessionId: smsResult.sessionId,
          message: 'SMS OTP sent successfully',
          type: 'sms',
          dbFormattedPhone: dbFormattedPhone
        };
      }

      // SMS failed - return error instead of falling back to voice
      logger.error(`SMS OTP failed for ${apiFormattedPhone}: ${smsResult.error}`);
      return {
        success: false,
        error: `Failed to send SMS OTP: ${smsResult.error}. Please check your 2Factor template configuration or account balance.`
      };

    } catch (error) {
      logger.error('Error sending OTP:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to send OTP'
      };
    }
  }

  /**
   * Send SMS OTP using approved template
   * # Fixed 2Factor SMS OTP issue (Urbanesta_Realtors template)
   * Template Name: Urbanesta_Realtors
   * Sender ID: SLVECH (configured in 2Factor template)
   * @param {string} apiFormattedPhone - Phone number formatted for API
   * @returns {Promise<Object>} - Response with sessionId
   */
  async sendSMSOTP(apiFormattedPhone) {
    try {
      // Use AUTOGEN3 with approved Urbanesta_Realtors template (4-digit OTP via SMS)
      // AUTOGEN3 generates 4-digit OTPs (AUTOGEN and AUTOGEN2 generate 6-digit OTPs)
      // Template Name: Urbanesta_Realtors
      // Sender ID: SLVECH (configured in 2Factor template)
      // Endpoint format: /API/V1/API_KEY/SMS/PHONE_NUMBER/AUTOGEN3/Urbanesta_Realtors
      const apiKey = this.getApiKey();
      const apiUrl = `${this.baseUrl}/${apiKey}/SMS/${apiFormattedPhone}/AUTOGEN3/Urbanesta_Realtors`;
      
      // Log the API call (mask API key for security)
      logger.info(`Sending SMS OTP via 2Factor API: ${apiUrl.replace(apiKey, '***')}`);
      logger.info(`Phone number format: ${apiFormattedPhone}`);
      
      const response = await axios.get(apiUrl, { timeout: 10000 });

      // Log full 2Factor response for debugging
      logger.info(`2Factor SMS API Response:`, {
        Status: response.data.Status,
        Details: response.data.Details,
        Message: response.data.Message
      });

      if (response.data.Status === 'Success') {
        // Verify that we got a sessionId (SMS was sent, not voice)
        if (!response.data.Details) {
          logger.error('2Factor returned Success but no sessionId');
          return {
            success: false,
            error: 'Invalid response from 2Factor API - no session ID received'
          };
        }
        
        logger.info(`SMS OTP session created: ${response.data.Details}`);
        return {
          success: true,
          sessionId: response.data.Details
        };
      } else {
        // Log the exact error from 2Factor - this is critical for debugging
        logger.error(`2Factor SMS API Error - SMS delivery failed:`, {
          Status: response.data.Status,
          Details: response.data.Details,
          Message: response.data.Message,
          fullResponse: JSON.stringify(response.data, null, 2),
          templateName: 'Urbanesta_Realtors',
          senderId: 'SLVECH',
          phoneNumber: apiFormattedPhone
        });
        
        // Return detailed error - do NOT fall back to voice
        const errorMsg = response.data.Details || response.data.Message || 'SMS delivery failed';
        logger.error(`SMS OTP failed. Error: ${errorMsg}. Check template configuration in 2Factor dashboard.`);
        
        return {
          success: false,
          error: `SMS delivery failed: ${errorMsg}. Please check your 2Factor template 'Urbanesta_Realtors' (Sender ID: SLVECH) is properly configured and linked to DLT.`
        };
      }
    } catch (error) {
      // Log detailed error information
      logger.error(`2Factor SMS API Exception:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url?.replace(this.getApiKey(), '***')
      });
      
      return {
        success: false,
        error: error.response?.data?.Details || error.response?.data?.Message || error.message || 'SMS API error'
      };
    }
  }

  /**
   * Send Voice OTP as fallback
   * @param {string} apiFormattedPhone - Phone number formatted for API
   * @returns {Promise<Object>} - Response with sessionId
   */
  async sendVoiceOTP(apiFormattedPhone) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.getApiKey()}/SMS/${apiFormattedPhone}/AUTOGEN/VOICE`,
        { timeout: 15000 } // 15 second timeout for voice calls
      );

      if (response.data.Status === 'Success') {
        return {
          success: true,
          sessionId: response.data.Details
        };
      } else {
        return {
          success: false,
          error: response.data.Details || 'Voice delivery failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'Voice API error'
      };
    }
  }

  /**
   * Verify OTP
   * # Fixed 2Factor SMS OTP issue (Urbanesta_Realtors template)
   * @param {string} sessionId - Session ID from sendOTP response
   * @param {string} otp - OTP entered by user (4-digit)
   * @returns {Promise<Object>} - Verification result
   */
  async verifyOTP(sessionId, otp) {
    try {
      // Validate inputs
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Session ID is required and must be a string');
      }
      if (!otp || typeof otp !== 'string') {
        throw new Error('OTP is required and must be a string');
      }

      logger.info(`Verifying OTP for session: ${sessionId}`);
      
      const apiKey = this.getApiKey();
      const verifyUrl = `${this.baseUrl}/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;
      
      logger.info(`2Factor Verify API: ${verifyUrl.replace(apiKey, '***')}`);
      
      const response = await axios.get(verifyUrl, { timeout: 10000 });

      // Log verification response
      logger.info(`2Factor Verify API Response:`, {
        Status: response.data.Status,
        Details: response.data.Details,
        Message: response.data.Message
      });

      if (response.data.Status === 'Success') {
        logger.info('OTP verified successfully');
        return {
          success: true,
          message: 'OTP verified successfully'
        };
      } else {
        logger.error('OTP verification failed:', response.data);
        return {
          success: false,
          error: response.data.Details || response.data.Message || 'Invalid OTP'
        };
      }
    } catch (error) {
      logger.error('Error verifying OTP:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      return {
        success: false,
        error: error.response?.data?.Details || error.response?.data?.Message || error.message || 'Failed to verify OTP'
      };
    }
  }

  /**
   * Format phone number to include country code with + prefix for database storage
   * @param {string} phoneNumber - Phone number
   * @returns {string} - Formatted phone number with + prefix
   */
  formatPhoneNumber(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 91, add + prefix
    if (cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    
    // If it's a 10-digit Indian number, add 91 and + prefix
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    
    // If it's already formatted with +, return as is
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    // Add + prefix to any other format
    return `+${cleaned}`;
  }

  /**
   * Format phone number for 2Factor API (with + prefix for AUTOGEN3)
   * According to 2Factor docs, AUTOGEN3 requires phone in international format with +
   * @param {string} phoneNumber - Phone number
   * @returns {string} - Formatted phone number with + prefix
   */
  formatPhoneForAPI(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 91, add + prefix
    if (cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    
    // If it's a 10-digit Indian number, add 91 and + prefix
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    
    // If it's already formatted with +, return as is
    if (phoneNumber.startsWith('+')) {
      return phoneNumber;
    }
    
    // Add + prefix to any other format
    return `+${cleaned}`;
  }

  /**
   * Check account balance
   * @returns {Promise<Object>} - Balance information
   */
  async getBalance() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.getApiKey()}/BAL/TRANSACTION`
      );

      if (response.data.Status === 'Success') {
        return {
          success: true,
          balance: response.data.Details,
          message: 'Balance retrieved successfully'
        };
      } else {
        return {
          success: false,
          error: response.data.Details || 'Failed to get balance'
        };
      }
    } catch (error) {
      logger.error('Error getting balance:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to get balance'
      };
    }
  }
}

export default new TwoFactorService();
