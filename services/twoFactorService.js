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
   * Send OTP to phone number - tries SMS first, then voice if SMS fails
   * @param {string} phoneNumber - Phone number with country code (e.g., "919876543210")
   * @returns {Promise<Object>} - Response with sessionId
   */
  async sendOTP(phoneNumber) {
    try {
      // Validate input
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        throw new Error('Phone number is required and must be a string');
      }

      // Format phone number for 2Factor API (without + prefix)
      const apiFormattedPhone = this.formatPhoneForAPI(phoneNumber);
      // Format phone number for database storage (with + prefix)
      const dbFormattedPhone = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`Attempting to send OTP to phone: ${apiFormattedPhone} (DB format: ${dbFormattedPhone})`);
      
      // First try: Send SMS using approved template
      const smsResult = await this.sendSMSOTP(apiFormattedPhone);
      if (smsResult.success) {
        logger.info(`SMS OTP sent successfully to ${apiFormattedPhone}`);
        return {
          success: true,
          sessionId: smsResult.sessionId,
          message: 'SMS OTP sent successfully',
          type: 'sms',
          dbFormattedPhone: dbFormattedPhone
        };
      }

      // If SMS fails, try voice OTP
      logger.warn(`SMS OTP failed for ${apiFormattedPhone}, trying voice OTP: ${smsResult.error}`);
      const voiceResult = await this.sendVoiceOTP(apiFormattedPhone);
      
      if (voiceResult.success) {
        logger.info(`Voice OTP sent successfully to ${apiFormattedPhone}`);
        return {
          success: true,
          sessionId: voiceResult.sessionId,
          message: 'Unable to send SMS OTP. Voice OTP has been sent to your number.',
          type: 'voice',
          dbFormattedPhone: dbFormattedPhone,
          fallback: true
        };
      }

      // Both SMS and voice failed
      logger.error(`Both SMS and voice OTP failed for ${apiFormattedPhone}`);
      return {
        success: false,
        error: `Unable to send OTP. SMS error: ${smsResult.error}. Voice error: ${voiceResult.error}`
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
   * @param {string} apiFormattedPhone - Phone number formatted for API
   * @returns {Promise<Object>} - Response with sessionId
   */
  async sendSMSOTP(apiFormattedPhone) {
    try {
      // Use the approved UrbanestaOTP template
      const response = await axios.get(
        `${this.baseUrl}/${this.getApiKey()}/SMS/${apiFormattedPhone}/AUTOGEN/UrbanestaOTP`,
        { timeout: 10000 } // 10 second timeout
      );

      if (response.data.Status === 'Success') {
        return {
          success: true,
          sessionId: response.data.Details
        };
      } else {
        return {
          success: false,
          error: response.data.Details || 'SMS delivery failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'SMS API error'
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
   * @param {string} sessionId - Session ID from sendOTP response
   * @param {string} otp - OTP entered by user
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
      
      const response = await axios.get(
        `${this.baseUrl}/${this.getApiKey()}/SMS/VERIFY/${sessionId}/${otp}`,
        { timeout: 10000 } // 10 second timeout
      );

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
          error: response.data.Details || 'Invalid OTP'
        };
      }
    } catch (error) {
      logger.error('Error verifying OTP:', error.message);
      return {
        success: false,
        error: error.response?.data?.Details || error.message || 'Failed to verify OTP'
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
   * Format phone number for 2Factor API (without + prefix)
   * @param {string} phoneNumber - Phone number
   * @returns {string} - Formatted phone number without + prefix
   */
  formatPhoneForAPI(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 91, return as is
    if (cleaned.startsWith('91')) {
      return cleaned;
    }
    
    // If it's a 10-digit Indian number, add 91
    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }
    
    // If it's already formatted, return as is
    return cleaned;
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
