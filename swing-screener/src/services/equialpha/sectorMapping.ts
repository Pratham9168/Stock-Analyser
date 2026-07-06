// Exact mapping from the extracted application + expanded to cover full NSE classification
export const SECTOR_INDUSTRY_MAP: Record<string, string[]> = {
  "Aerospace & Defence":       ["Defence", "Aerospace", "Aerospace & Defense"],
  "Automobile":                ["Automobiles", "Auto Ancillaries", "Tyres", "Electric Vehicles", "Auto Components & Equipments", "2/3 Wheelers", "Passenger Cars & Utility Vehicles", "Commercial Vehicles", "Tractors", "Auto Dealer", "Auto Components"],
  "Banking":                   ["Private Banks", "PSU Banks", "Small Finance Banks", "Private Sector Bank", "Public Sector Bank", "Banks", "Other Bank"],
  "Cement":                    ["Cement", "Cement & Cement Products", "Construction Materials"],
  "Chemicals":                 ["Specialty Chemicals", "Agrochemicals", "Basic Chemicals", "Commodity Chemicals", "Chemicals & Petrochemicals", "Dyes & Pigments", "Pesticides & Agrochemicals", "Paints", "Decorative Paints", "Industrial Gases & Fuels", "Carbon Black"],
  "Construction":              ["Construction", "Infrastructure", "Civil Construction", "Roads & Highways", "Ports", "Railways", "Ship Building", "Construction & Engineering"],
  "Consumer Discretionary":    ["Trading & Distribution", "Retail", "Jewellery", "Apparel", "Gems, Jewellery And Watches", "Retailing", "Garments & Apparels", "Trading - Chemicals", "Leather", "E-Commerce/App Based Aggregator", "E-Commerce", "Department Stores", "Footwear", "Furniture", "Home Furnishing", "Houseware", "Leisure Services", "Amusement Parks/Other Recreation", "Consumer Durables"],
  "Consumer Staples":          ["FMCG", "Food Products", "Personal Care", "Breweries & Distilleries", "Tea / Coffee", "Diversified FMCG", "Household Products", "Plantation & Plantation Products", "Cigarettes/Tobacco", "Tobacco Products", "Edible Oil", "Dairy Products", "Animal Feed", "Agricultural Food & Other Products", "Packaged Foods", "Beverages", "Fast Moving Consumer Goods"],
  "Diamond":                   ["Diamond & Gems"],
  "Energy":                    ["Refineries", "Oil & Gas", "Power Generation", "Renewable Energy", "Solar Energy", "Wind Electric Power Generation", "Petroleum Products", "Power Generation & Distribution"],
  "Engineering":               ["Capital Goods", "Industrial Machinery", "Heavy Electrical Equipment", "Other Industrial Products", "Compressors / Pumps", "Engines", "Turbines"],
  "Fertiliser":                ["Fertilisers", "Fertilizers", "Fertilizers & Agrochemicals"],
  "Financial Services":        ["NBFC", "Microfinance", "Wealth Management", "Exchanges", "Finance (including NBFCs)", "Financial Institutions", "Investment Company", "Holding Company", "Asset Management Company", "Financial Services", "Stockbroking & Allied", "Capital Markets", "Rating Agency", "Housing Finance Company", "Housing Finance", "Other Financial Services", "Finance", "Depositories, Clearing Houses and Other Intermediaries", "Financial Technology (Fintech)"],
  "Healthcare":                ["Pharma", "Hospitals", "Diagnostics", "Medical Devices", "Pharmaceuticals", "Healthcare Providers", "Healthcare Services", "Health Care Equipment", "Healthcare Equipment & Supplies", "Pharmaceuticals & Biotechnology"],
  "Hospitality":               ["Hotels", "Quick Service Restaurants", "Restaurants", "Hotels & Resorts", "Catering"],
  "Industrials":               ["Electrical Equipment", "Industrial Products", "Electronics", "Packaging", "Abrasives", "Cables", "Bearings", "Logistics Solution Provider", "Transport Related Services", "Diversified", "Diversified Metals", "Conglomerates", "Other Electrical Equipment", "Other Elect.Equipment/Products", "Plastic Products", "Rubber", "Containers & Packaging", "Fasteners"],
  "Information Technology":    ["IT Services", "IT Consulting", "SaaS", "Software", "Computers - Software", "IT Enabled Services", "Data Processing", "Internet Software & Services", "Cloud Services", "Computers - Software & Consulting", "Computers - Software - Medium / Small", "Information Technology"],
  "Infrastructure":            ["Roads & Highways", "Ports", "Railways", "Ship Building"],
  "Insurance":                 ["Life Insurance", "General Insurance", "Insurance"],
  "Materials":                 ["Steel", "Aluminium", "Copper", "Other Metals", "Iron & Steel", "Castings/Forgings", "Iron & Steel Products", "Sponge Iron", "Pig Iron", "Glass & Glass Products", "Ceramic Products", "Plywood/Laminates", "Refractory", "Zinc", "Forest Materials"],
  "Media & Telecom":           ["Media & Entertainment", "Telecom Services", "Digital Media", "TV Broadcasting & Software Production", "Film Production, Distribution & Entertainment", "Printing & Publishing", "Advertising & Media", "Media Entertainment & Publication"],
  "Metal":                     ["Ferrous Metals", "Non-Ferrous Metals", "Metals & Mining", "Precious Metals"],
  "Mining":                    ["Coal", "Mining & Minerals", "Mining"],
  "Oil & Gas":                 ["Gas Distribution", "Oil Exploration", "Lubricants", "Exploration & Production", "LPG/CNG/PNG/LNG Supplier", "Gas Transmission/Marketing", "Oil Marketing & Distribution", "Oil Gas & Consumable Fuels"],
  "Paper":                     ["Paper & Packaging", "Paper & Paper Products"],
  "Realty":                    ["Real Estate", "Commercial Real Estate", "Realty", "Residential Commercial Projects"],
  "Services":                  ["Staffing", "Logistics", "Business Services", "Tour Travel Related Services", "Air Transport Service", "Airline", "Shipping", "Education", "Online Education", "Courier Services", "BPO/KPO", "Consulting Services", "Facility Management", "Marine Port & Services", "Consumer Services"],
  "Sugar":                     ["Sugar", "Ethanol"],
  "Telecom":                   ["Telecom Infrastructure", "Telecom - Equipment & Accessories", "Telecom - Services", "Telecom - Cellular & Fixed line services", "Telecommunication"],
  "Textile":                   ["Textiles", "Cotton", "Textiles & Apparels", "Jute & Jute Products", "Synthetic Textiles", "Readymade Garments/ Apparells"],
  "Utilities":                 ["Power Transmission", "Power Distribution", "Water Utilities", "Electric Utilities", "Gas Utilities", "Multi Utilities"]
};

/**
 * Returns the parent sector for a given industry.
 */
export function getParentSector(industry: string): string {
  if (!industry) return "Others";
  
  for (const [sector, industries] of Object.entries(SECTOR_INDUSTRY_MAP)) {
    // Case insensitive matching, or partial matching
    if (industries.some(ind => ind.toLowerCase() === industry.toLowerCase())) {
      return sector;
    }
  }
  
  // Try partial mapping if exact match fails
  for (const [sector, industries] of Object.entries(SECTOR_INDUSTRY_MAP)) {
    if (industries.some(ind => industry.toLowerCase().includes(ind.toLowerCase()) || ind.toLowerCase().includes(industry.toLowerCase()))) {
      return sector;
    }
  }

  return "Others";
}
