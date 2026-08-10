/** Industries where licensing/insurance claims are commonly expected. */
const LICENSE_INDUSTRIES = [
  'hvac',
  'plumbing',
  'electrical',
  'electric',
  'legal',
  'law',
  'medical',
  'health',
  'dental',
  'construction',
  'contractor',
  'roofing',
  'insurance',
];

export function industryRequiresLicense(industry: string | null | undefined): boolean {
  const value = String(industry ?? '')
    .trim()
    .toLowerCase();
  if (!value) return false;
  return LICENSE_INDUSTRIES.some((key) => value.includes(key));
}
