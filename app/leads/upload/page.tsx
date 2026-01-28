'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { Upload, Download, FileText, CheckCircle, XCircle, AlertCircle, ArrowLeft, X } from 'lucide-react'
import Papa from 'papaparse'
import Link from 'next/link'

interface ParsedLead {
  [key: string]: any
}

interface ValidationError {
  row: number
  field: string
  message: string
}

export default function UploadLeadsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedLead[]>([])
  const [allData, setAllData] = useState<ParsedLead[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload')
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [fileEncoding, setFileEncoding] = useState<string>('')

  // Required fields for leads
  const requiredFields = ['name', 'source']
  const optionalFields = [
    'phone',
    'email',
    'requirement',
    'interest_level',
    'budget_range',
    'timeline',
    'campaign_id',
    'ad_id',
    'adset_id',
    'form_id',
    'form_name',
    'ad_name',
    'campaign_name',
    'platform',
    'status',
  ]

  // Column mapping for common variations (e.g., Meta Lead forms)
  // Using lowercase keys for case-insensitive matching
  const columnMappings: Record<string, string> = {
    // Name variations
    'full_name': 'name',
    'fullname': 'name',
    'customer_name': 'name',
    'name': 'name',
    
    // Phone variations
    'phone_number': 'phone',
    'phonenumber': 'phone',
    'mobile': 'phone',
    'contact_number': 'phone',
    'phone': 'phone',
    
    // Email variations
    'email_address': 'email',
    'e-mail': 'email',
    'email': 'email',
    
    // Meta Lead form specific fields
    'id': 'meta_lead_id',
    'created_time': 'meta_created_time',
    'ad_id': 'ad_id',
    'ad_name': 'ad_name',
    'adset_id': 'adset_id',
    'adset_name': 'adset_name',
    'campaign_id': 'campaign_id',
    'campaign_name': 'campaign_name',
    'form_id': 'form_id',
    'form_name': 'form_name',
    'is_organic': 'is_organic',
    'platform': 'platform',
    
    // Service/requirement fields - handle specially
    'what_services_are_you_looking_for?': 'service_requested',
    'car_model': 'car_model_requested',
    'service': 'requirement',
    'requirement': 'requirement',
  }

  // Function to check if a row is completely empty
  const isEmptyRow = (row: ParsedLead): boolean => {
    // Get all values from the row
    const values = Object.values(row)
    
    // If no values at all, it's empty
    if (values.length === 0) return true
    
    // Check if all values are empty after cleaning
    return values.every(value => {
      if (value === null || value === undefined) return true
      
      if (typeof value === 'string') {
        // Remove null bytes and other control characters before checking
        const cleaned = value.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()
        return cleaned === ''
      }
      
      return false
    })
  }

  // Function to clean null bytes from strings (for encoding issues)
  const cleanString = (value: any): any => {
    if (value === null || value === undefined) {
      return ''
    }
    
    if (typeof value === 'string') {
      // Remove null bytes and other control characters, then trim
      let cleaned = value.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()
      
      // Remove surrounding quotes if present (from CSV parsing issues)
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1).trim()
      }
      
      // Remove "p:" prefix from phone numbers (Meta format)
      if (cleaned.startsWith('p:')) {
        cleaned = cleaned.substring(2).trim()
      }
      
      // Remove "l:", "ag:", "as:", "c:", "f:" prefixes (Meta ID formats)
      if (/^[a-z]+:/.test(cleaned)) {
        cleaned = cleaned.replace(/^[a-z]+:/, '').trim()
      }
      
      return cleaned
    }
    
    return String(value).trim()
  }

  // Function to normalize/map column names
  const normalizeColumns = (data: ParsedLead[]): ParsedLead[] => {
    if (!data || data.length === 0) return []
    
    return data
      .filter(row => !isEmptyRow(row)) // Filter out completely empty rows
      .map(row => {
        const normalizedRow: ParsedLead = {}
        
        // Map each column with case-insensitive and trimmed key matching
        Object.keys(row).forEach(key => {
          // Clean the key first (remove null bytes from encoding issues)
          const cleanedKey = cleanString(key)
          
          // Normalize the key: trim whitespace and convert to lowercase for matching
          const normalizedKey = cleanedKey.toLowerCase()
          const mappedKey = columnMappings[normalizedKey] || cleanedKey
          
          // Store the value (clean null bytes, then trim if it's a string)
          const value = row[key]
          const cleanedValue = cleanString(value)
          
          // Only store non-empty values
          if (cleanedValue !== '') {
            normalizedRow[mappedKey] = cleanedValue
          }
        })
        
        // Build requirement field from service_requested and/or car_model_requested
        if (!normalizedRow.requirement || normalizedRow.requirement === '') {
          const parts: string[] = []
          
          if (normalizedRow.service_requested) {
            parts.push(normalizedRow.service_requested)
          }
          
          if (normalizedRow.car_model_requested) {
            parts.push(`Car Model: ${normalizedRow.car_model_requested}`)
          }
          
          if (parts.length > 0) {
            normalizedRow.requirement = parts.join(' | ')
          }
        }
        
        // Auto-detect source from platform if source is missing
        if (!normalizedRow.source && normalizedRow.platform) {
          const platform = String(normalizedRow.platform).toLowerCase().trim()
          // Map platform to source
          if (platform === 'ig' || platform === 'instagram' || platform === 'fb' || platform === 'facebook') {
            normalizedRow.source = 'meta'
          } else {
            normalizedRow.source = 'meta' // Default to meta for Meta Lead forms
          }
        }
        
        // If still no source but we have campaign_id or form_id or meta_lead_id, assume it's from Meta
        if ((!normalizedRow.source || normalizedRow.source.trim() === '') && 
            (normalizedRow.campaign_id || normalizedRow.form_id || normalizedRow.meta_lead_id)) {
          normalizedRow.source = 'meta'
        }
        
        // If still no source, set default
        if (!normalizedRow.source || (typeof normalizedRow.source === 'string' && normalizedRow.source.trim() === '')) {
          normalizedRow.source = 'manual'
        }
        
        return normalizedRow
      })
  }

  // Example template data
  const templateData = [
    {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john.doe@example.com',
      source: 'meta',
      requirement: 'paint_protection_film',
      interest_level: 'hot',
      budget_range: '$5000-$10000',
      timeline: '1-2 weeks',
      campaign_id: 'CAM123',
      ad_id: 'AD456',
      adset_id: 'ADS789',
      form_id: 'FORM001',
      form_name: 'Contact Form',
      ad_name: 'Summer Sale',
      campaign_name: 'Q2 Campaign',
      platform: 'ig',
      status: 'new',
    },
  ]

  // Download template CSV
  const downloadTemplate = () => {
    const csv = Papa.unparse(templateData, {
      header: true,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'leads_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Validate lead data
  const validateLead = (lead: ParsedLead, index: number): ValidationError[] => {
    const errors: ValidationError[] = []

    // Check required fields - only name and source are required
    if (!lead.name || (typeof lead.name === 'string' && lead.name.trim() === '')) {
      errors.push({ row: index + 2, field: 'name', message: 'Name is required' })
    }
    
    if (!lead.source || lead.source.trim() === '') {
      errors.push({ row: index + 2, field: 'source', message: 'Source is required' })
    } else {
      const validSources = ['meta', 'manual', 'form', 'whatsapp', 'ivr']
      if (!validSources.includes(lead.source.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'source',
          message: `Source must be one of: ${validSources.join(', ')}`,
        })
      }
    }

    // Validate phone format if provided
    if (lead.phone && lead.phone.trim() !== '') {
      // Basic phone validation - should contain at least some digits
      const phoneDigits = lead.phone.replace(/\D/g, '')
      if (phoneDigits.length < 10) {
        errors.push({ row: index + 2, field: 'phone', message: 'Phone number should have at least 10 digits' })
      }
    }

    // Validate email format if provided
    if (lead.email && lead.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(lead.email)) {
        errors.push({ row: index + 2, field: 'email', message: 'Invalid email format' })
      }
    }
    
    // Note: Phone and email are both optional fields
    // Leads can be imported without contact information if needed

    // Validate interest_level if provided
    if (lead.interest_level && lead.interest_level.trim() !== '') {
      const validLevels = ['hot', 'warm', 'cold']
      if (!validLevels.includes(lead.interest_level.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'interest_level',
          message: `Interest level must be one of: ${validLevels.join(', ')}`,
        })
      }
    }

    // Validate status if provided
    if (lead.status && lead.status.trim() !== '') {
      const validStatuses = [
        'new',
        'qualified',
        'unqualified',
        'quotation_shared',
        'quotation_viewed',
        'quotation_accepted',
        'quotation_expired',
        'interested',
        'negotiation',
        'lost',
        'converted',
        'deal_won',
        'payment_pending',
        'advance_received',
        'fully_paid',
      ]
      if (!validStatuses.includes(lead.status.toLowerCase())) {
        errors.push({
          row: index + 2,
          field: 'status',
          message: 'Invalid status value',
        })
      }
    }

    return errors
  }

  // Function to detect and handle file encoding
  const readFileWithEncoding = async (file: File): Promise<{ text: string; encoding: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const bytes = new Uint8Array(arrayBuffer)
        
        // Check for UTF-16 BOM (Byte Order Mark)
        // UTF-16 LE: FF FE
        // UTF-16 BE: FE FF
        let encoding = 'utf-8'
        
        if (bytes.length >= 2) {
          if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
            encoding = 'utf-16le'
          } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
            encoding = 'utf-16be'
          } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            encoding = 'utf-8' // UTF-8 with BOM
          }
        }
        
        // Decode with detected encoding
        const decoder = new TextDecoder(encoding)
        let text = decoder.decode(arrayBuffer)
        
        // Remove BOM if present at the start
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.substring(1)
        }
        
        resolve({ text, encoding })
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setValidationErrors([])
    setUploadResults(null)
    setStep('upload')

    try {
      const { text, encoding } = await readFileWithEncoding(selectedFile)
      setFileEncoding(encoding)
      
      console.log('File encoding detected:', encoding)
      
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy', // Skip lines where all fields are empty
        transformHeader: (header) => header.trim(), // Trim header names
        complete: (results) => {
          const rawData = results.data as ParsedLead[]
          
          // Detect column mappings from the first row
          const detectedMappings: Record<string, string> = {}
          if (rawData.length > 0) {
            Object.keys(rawData[0]).forEach(key => {
              const normalizedKey = key.trim().toLowerCase()
              const mappedKey = columnMappings[normalizedKey] || key.trim()
              if (mappedKey !== key.trim()) {
                detectedMappings[key] = mappedKey
              }
            })
          }
          setColumnMapping(detectedMappings)
          
          console.log('CSV Columns detected:', rawData.length > 0 ? Object.keys(rawData[0]) : [])
          console.log('Raw data sample (first row):', rawData[0])
          console.log('Column mappings applied:', detectedMappings)
          console.log('Total raw rows parsed:', rawData.length)
          
          // Normalize column names to match expected format
          const data = normalizeColumns(rawData)
          
          console.log('Total rows after normalization:', data.length)
          console.log('Sample normalized row (first):', data[0])
          console.log('Sample normalized row (second):', data[1])
          
          setAllData(data)
          setPreview(data.slice(0, 10)) // Show first 10 rows

          // Validate all rows
          const errors: ValidationError[] = []
          data.forEach((lead, index) => {
            const rowErrors = validateLead(lead, index)
            errors.push(...rowErrors)
          })
          setValidationErrors(errors)

          if (errors.length === 0) {
            setStep('preview')
          }
        },
        error: (error: any) => {
          alert(`Error parsing CSV: ${error.message}`)
        },
      })
    } catch (error) {
      alert('Error reading file. Please ensure it is a valid CSV file.')
    }
  }

  // Handle file upload
  const handleUpload = async () => {
    if (allData.length === 0) return

    setUploading(true)
    setUploadResults(null)

    try {
      // Prepare data for upload
      const leadsToUpload = allData.map((lead) => {
        const metaData: Record<string, any> = {}
        if (lead.platform) metaData.platform = lead.platform

        return {
          name: lead.name?.trim() || '',
          phone: lead.phone?.trim() || null,  // Phone is optional
          email: lead.email?.trim() || null,  // Email is optional
          source: (lead.source?.trim() || 'manual').toLowerCase(),
          requirement: lead.requirement?.trim() || null,
          campaign_id: lead.campaign_id?.trim() || null,
          ad_id: lead.ad_id?.trim() || null,
          adset_id: lead.adset_id?.trim() || null,
          form_id: lead.form_id?.trim() || null,
          form_name: lead.form_name?.trim() || null,
          ad_name: lead.ad_name?.trim() || null,
          campaign_name: lead.campaign_name?.trim() || null,
          meta_data: Object.keys(metaData).length > 0 ? metaData : null,
        }
      })

      const response = await fetch('/api/leads/bulk-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leads: leadsToUpload }),
      })

      const result = await response.json()

      if (response.ok) {
        const successCount = result.results?.success?.length || result.success || 0
        const failedCount = result.results?.failed?.length || result.failed || 0
        const errors = result.results?.failed?.map((f: any) => `Row ${f.row}: ${f.error}`) || []
        
        setUploadResults({
          success: successCount,
          failed: failedCount,
          errors: errors,
        })
        setStep('results')
      } else {
        alert(result.error || 'Failed to upload leads')
      }
    } catch (error) {
      alert('Error uploading leads. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Reset and start over
  const handleReset = () => {
    setFile(null)
    setPreview([])
    setAllData([])
    setValidationErrors([])
    setUploadResults(null)
    setStep('upload')
    setColumnMapping({})
    setFileEncoding('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/leads"
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Leads</h1>
              <p className="text-gray-600 mt-1">Upload a CSV file to import leads into the system</p>
            </div>
          </div>
        </div>

        {/* Template Download Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Need a template?</h3>
              <p className="text-blue-700 text-sm mb-3">
                Download our CSV template with example data to ensure your file is formatted correctly.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Download size={18} />
                Download Template
              </button>
            </div>
          </div>
        </div>

        {/* Supported Formats Info */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-green-900 mb-1">Meta Lead Form Exports Supported!</h3>
              <p className="text-green-700 text-sm mb-2">
                You can directly upload CSV exports from Facebook/Instagram Lead Forms. The system automatically maps columns like <code className="bg-green-100 px-1 rounded">full_name</code>, <code className="bg-green-100 px-1 rounded">phone_number</code>, and <code className="bg-green-100 px-1 rounded">platform</code> to the correct format.
              </p>
              <p className="text-green-700 text-sm">
                <strong>Required:</strong> <code className="bg-green-100 px-1 rounded">name</code> · <strong>Optional:</strong> <code className="bg-green-100 px-1 rounded">phone</code>, <code className="bg-green-100 px-1 rounded">email</code> (but at least one contact method is recommended)
              </p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        {step === 'upload' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Upload size={32} className="text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload CSV File</h2>
              <p className="text-gray-600 mb-6">
                Select a CSV file containing lead information. The file will be validated before upload.
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-[#ed1b24] transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileText size={48} className="text-gray-400 mb-4" />
                  <span className="text-[#ed1b24] font-medium mb-2">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-sm text-gray-500">CSV files only</span>
                </label>
              </div>

              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                  <FileText size={16} />
                  <span>{file.name}</span>
                  <button
                    onClick={handleReset}
                    className="ml-2 text-red-600 hover:text-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Encoding Detection Info */}
              {fileEncoding && fileEncoding !== 'utf-8' && (
                <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-green-900 text-sm">
                        File Encoding Detected & Converted
                      </h3>
                      <p className="text-green-700 text-sm mt-1">
                        Your file was encoded in <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono">{fileEncoding.toUpperCase()}</code> format and has been automatically converted to UTF-8 for processing.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Column Mapping Info */}
              {Object.keys(columnMapping).length > 0 && (
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <CheckCircle size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-900 text-sm">
                        Auto-mapped {Object.keys(columnMapping).length} column(s)
                      </h3>
                      <p className="text-blue-700 text-sm mt-1">
                        The following columns were automatically mapped:
                      </p>
                      <ul className="text-sm text-blue-700 mt-2 space-y-1">
                        {Object.entries(columnMapping).map(([original, mapped]) => (
                          <li key={original}>
                            <code className="bg-blue-100 px-1.5 py-0.5 rounded">{original}</code>
                            {' → '}
                            <code className="bg-blue-100 px-1.5 py-0.5 rounded">{mapped}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Info */}
              {file && allData.length > 0 && validationErrors.length > 0 && (
                <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm mb-2">
                        Debug Information
                      </h3>
                      <div className="text-sm text-gray-700 space-y-2">
                        <p><strong>Rows parsed:</strong> {allData.length}</p>
                        <p><strong>Columns detected:</strong> {preview.length > 0 ? Object.keys(preview[0]).join(', ') : 'none'}</p>
                        {preview.length > 0 && (
                          <>
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                              <p className="font-semibold mb-1">Fields Check (First Row):</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li><strong>name (required):</strong> {preview[0].name ? `✅ "${preview[0].name}"` : '❌ Missing'}</li>
                                <li><strong>phone (optional):</strong> {preview[0].phone ? `✅ "${preview[0].phone}"` : '⚠️ Not provided'}</li>
                                <li><strong>email (optional):</strong> {preview[0].email ? `✅ "${preview[0].email}"` : '⚠️ Not provided'}</li>
                                <li><strong>source (required):</strong> {preview[0].source ? `✅ "${preview[0].source}"` : '❌ Missing'}</li>
                              </ul>
                            </div>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                                View complete first row data
                              </summary>
                              <pre className="mt-2 p-2 bg-white rounded border border-gray-300 text-xs overflow-x-auto max-h-96">
                                {JSON.stringify(preview[0], null, 2)}
                              </pre>
                            </details>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={20} className="text-red-600" />
                    <h3 className="font-semibold text-red-900">
                      Validation Errors ({validationErrors.length})
                    </h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <ul className="space-y-1 text-sm text-red-700">
                      {validationErrors.slice(0, 20).map((error, index) => (
                        <li key={index}>
                          Row {error.row}, {error.field}: {error.message}
                        </li>
                      ))}
                      {validationErrors.length > 20 && (
                        <li className="text-red-600 font-medium">
                          ... and {validationErrors.length - 20} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                  <p className="mt-3 text-sm text-red-700">
                    Please fix the errors in your CSV file before uploading.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview Section */}
        {step === 'preview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Preview Data</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review your data before uploading. Showing first 10 rows of {allData.length} total rows.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Upload Different File
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(preview[0] || {}).map((key) => (
                        <th
                          key={key}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {preview.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {Object.values(row).map((value: any, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                          >
                            {String(value || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <CheckCircle size={16} className="inline mr-2 text-green-600" />
                  All {allData.length} rows validated successfully
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-6 py-2 bg-[#ed1b24] text-white rounded-md hover:bg-[#d11820] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Upload {allData.length} Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {step === 'results' && uploadResults && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              {uploadResults.failed === 0 ? (
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Upload Successful!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Successfully uploaded {uploadResults.success} lead(s).
                  </p>
                </div>
              ) : (
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle size={32} className="text-yellow-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Upload Completed with Errors
                  </h2>
                  <p className="text-gray-600 mb-2">
                    Successfully uploaded {uploadResults.success} lead(s).
                  </p>
                  <p className="text-gray-600 mb-4">
                    Failed to upload {uploadResults.failed} lead(s).
                  </p>
                  {uploadResults.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left max-h-60 overflow-y-auto">
                      <ul className="space-y-1 text-sm text-red-700">
                        {uploadResults.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleReset}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Upload Another File
                </button>
                <Link
                  href="/leads"
                  className="px-6 py-2 bg-[#ed1b24] text-white rounded-md hover:bg-[#d11820]"
                >
                  View Leads
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
