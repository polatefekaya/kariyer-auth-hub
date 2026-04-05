export type AccountType = Employee | Company | Admin | Community;
export type AccountTypeId = EmployeeId | CompanyId | AdminId | CommunityId;

export type Employee = "employee";
export type Company = "company";
export type Admin = "admin";
export type Community = "community";

export type EmployeeId = "c";
export type CompanyId = "b";
export type AdminId = "a";
export type CommunityId = "co";

export const AccMapById: Record<AccountTypeId, AccountType> = {
  "c": "employee",
  "b": "company",
  "a": "admin",
  "co": "community"
}; 

export const AccMapByType: Record<AccountType, AccountTypeId> = {
  "employee": "c",
  "company": "b",
  "admin": "a",
  "community" : "co"
};
