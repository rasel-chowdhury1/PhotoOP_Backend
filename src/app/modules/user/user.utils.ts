// shared between user.service.ts (issues the token) and the guardian web module
// (verifies it), so the JWT payload's `purpose` claim can't be reused for other flows
export const GUARDIAN_VERIFICATION_PURPOSE = 'guardian-verification';

export const calculateAge = (dateOfBirth: Date | string): number => {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

// minors of this age range must have a guardian on file, and that guardian must confirm via email link
export const requiresGuardianVerification = (dateOfBirth?: Date | string | null): boolean => {
  if (!dateOfBirth) return false;
  const age = calculateAge(dateOfBirth);
  return age >= 16 && age <= 18;
};
