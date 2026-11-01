// Public release widens account scope only. Each caller still requires its own
// release approval, operator enablement, provider key and ledger admission.
export function paidAccountInScope(userId:string|undefined,configuredTestUsers:string|undefined) {
  if(!userId)return false;
  if(process.env.REAL_USERS_RELEASE_APPROVED==='true')return true;
  const scope=(configuredTestUsers??'').split(',').map(value=>value.trim()).filter(Boolean);
  return scope.length===0||scope.includes(userId);
}
