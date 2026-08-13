export function scannerVerifyModeForSession(sessionUser) {
  // Only an explicit boolean capability from the authenticated server
  // response enables simulation. Roles, truthy strings and client storage are
  // intentionally irrelevant so an older/partial response fails to betslip.
  return sessionUser?.demo_execution_allowed === true ? 'demo' : 'betslip';
}
