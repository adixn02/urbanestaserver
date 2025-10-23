import express from 'express';
import Lead from '../models/Lead.js';
import { validateRequest, validateInput, validationRules } from '../middleware/security.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Create a new lead with input validation
router.post('/', 
  validateInput([
    validationRules.name,
    validationRules.phone,
    validationRules.city,
    validationRules.email.optional()
  ]), 
  async (req, res) => {
  try {
    console.log('📝 [LEAD ROUTE] Creating new lead:', req.body);
    
    const {
      name,
      phone,
      email,
      city,
      propertyInterest,
      message,
      propertyId,
      propertyName,
      propertyUrl,
      source = 'website',
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!name || !phone || !city) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, phone, city'
      });
    }

    // Allow multiple submissions - no duplicate check
    console.log('📝 [LEAD ROUTE] Creating new lead for phone:', phone);

    // Create new lead
    const lead = new Lead({
      name,
      phone,
      email,
      city,
      propertyInterest,
      message,
      propertyId,
      propertyName,
      propertyUrl: propertyUrl || '', // Make it optional with fallback
      source,
      metadata: {
        ...metadata,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip || req.connection.remoteAddress,
        referrer: req.get('Referer')
      }
    });

    await lead.save();
    
    console.log('✅ [LEAD ROUTE] Lead created successfully:', lead._id);
    if (propertyUrl) {
      console.log('📍 [LEAD ROUTE] Property URL stored:', propertyUrl);
    } else {
      console.log('⚠️ [LEAD ROUTE] No property URL provided');
    }
    
    // Log the lead creation
    logger.info(`New lead created: ${name} (${phone}) - ${city}`, {
      leadId: lead._id,
      propertyId,
      source
    });

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: {
        id: lead._id,
        name: lead.name,
        phone: lead.phone,
        city: lead.city,
        propertyName: lead.propertyName,
        propertyUrl: lead.propertyUrl,
        status: lead.status,
        createdAt: lead.createdAt
      }
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error creating lead:', error);
    logger.error('Error creating lead', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get all leads (with pagination and filtering)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      city,
      source,
      propertyId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (city) filter.city = new RegExp(city, 'i');
    if (source) filter.source = source;
    if (propertyId) filter.propertyId = propertyId;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const leads = await Lead.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('propertyId', 'projectName title')
      .populate('assignedTo', 'name email');

    const total = await Lead.countDocuments(filter);

    res.json({
      success: true,
      data: leads,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error fetching leads:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get lead by ID
router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('propertyId', 'projectName title fullAddress')
      .populate('assignedTo', 'name email')
      .populate('notes.addedBy', 'name');

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error fetching lead:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update lead status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead status updated successfully',
      data: lead
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error updating lead status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Add note to lead
router.post('/:id/notes', async (req, res) => {
  try {
    const { note, addedBy } = req.body;
    
    if (!note) {
      return res.status(400).json({
        success: false,
        error: 'Note is required'
      });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    lead.notes.push({
      note,
      addedBy,
      addedAt: new Date()
    });

    await lead.save();

    res.json({
      success: true,
      message: 'Note added successfully',
      data: lead
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error adding note:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get lead statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
          contacted: { $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } }
        }
      }
    ]);

    const cityStats = await Lead.aggregate([
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const sourceStats = await Lead.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { total: 0, new: 0, contacted: 0, qualified: 0, converted: 0 },
        topCities: cityStats,
        sources: sourceStats
      }
    });

  } catch (error) {
    console.error('💥 [LEAD ROUTE] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
