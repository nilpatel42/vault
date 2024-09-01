# Copyright (c) 2024, NDV and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe, re
from frappe.model.document import Document
from frappe import _
from frappe.utils.password import get_decrypted_password, set_encrypted_password

class Vault(Document):
	def validate(self):
		self.validate_my_url(True)
		self.validate_strong_password()
		self.set_credentials_owner()

	@frappe.whitelist()
	def check_my_password_strength(self):
		if self.password:
			return get_password_strength(self.password)
		return False

	@frappe.whitelist()
	def validate_my_url(self, throw=False):
		if self.url:
			valid_url_schemes = ("http", "https")
			return frappe.utils.validate_url(self.url, throw=throw, valid_schemes=valid_url_schemes)

	def set_credentials_owner(self):
		if not self.credentials_owner:
			self.credentials_owner = self.owner

	def validate_strong_password(self):
		if self.password and self.ensure_strong_password:
			my_password = self.password
			if not self.is_new():
				my_password = get_decrypted_password(self.doctype, self.name, 'password', raise_exception=True)
			self.password_strength = get_password_strength(my_password)
			if self.ensure_strong_password and self.password_strength != "Strong":
				frappe.throw(_("Your password must include symbols, numbers, lowercase, and uppercase letters to be considered strong."))

	@frappe.whitelist()
	def generate_password(self):
		return create_new_password()

	@frappe.whitelist()
	def set_new_password(self, old_password, new_password):
		if get_decrypted_password(self.doctype, self.name, 'password', raise_exception=True) == old_password:
			if self.ensure_strong_password and get_password_strength(new_password) != "Strong":
				frappe.throw(_("Your password must include symbols, numbers, lowercase, and uppercase letters to be considered strong."))
			set_encrypted_password(self.doctype, self.name, new_password, 'password')
			self.reload()
			return True
		else:
			frappe.msgprint(_("Old Password is not valid. Please fill the correct Old Password to set a new password."))
			return False

	@frappe.whitelist()
	def get_my_password(self):
		if check_user_exist_in_list(self):
			return get_decrypted_password(self.doctype, self.name, 'password', raise_exception=True)
		else:
			frappe.throw(_("You have no permission to view the password."))

@frappe.whitelist()
def get_password_strength(pwd):
	# ref: https://www.codespeedy.com/check-the-password-strength-in-python/
	if len(pwd) >= 8:
		if bool(re.match(r'((?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,30})', pwd)) == True:
			return 'Strong'
		elif bool(re.match(r'((\d*)([a-z]*)([A-Z]*)([!@#$%^&*]*).{8,30})', pwd)) == True:
			return 'Good'
	else:
		return 'Weak'

@frappe.whitelist()
def validate_url(url):
	regex = re.compile(
        r'^(?:http|ftp)s?://' # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|' #domain...
        r'localhost|' #localhost...
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})' # ...or ip
        r'(?::\d+)?' # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)

	if bool(re.match(regex, url)) == True:
		return True
	return False

@frappe.whitelist()
def create_new_password():
	import random
	str = "abcdefghijklmnopqrstuvwxyz01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()?"
	pwd = "".join(random.sample(str, 8))
	while get_password_strength(pwd) != "Strong":
		pwd = "".join(random.sample(str, 8))
	return pwd

def check_user_exist_in_list(doc):
	if doc.authorized_users_list:
		for user in doc.authorized_users_list:
			if user.user == frappe.session.user:
				return True
	return True if (frappe.session.user in ['Administrator', doc.credentials_owner]) else False



import frappe

def get_permission_query_conditions(user):
    if user == 'Administrator':
        return None  # Admin has access to all documents

    conditions_list = []

    # Fetch Vault documents
    vault_docs = frappe.get_all('Vault', fields=['name'])

    for doc in vault_docs:
        # Fetch each Vault document to access its child table
        vault_doc = frappe.get_doc('Vault', doc.name)
        
        # Check if the user is the credentials owner or in the authorized users list
        credentials_owner = vault_doc.credentials_owner
        authorized_users = [entry.user for entry in vault_doc.get('authorized_users_list', [])]

        if user == credentials_owner or user in authorized_users:
            conditions_list.append(f"name = '{doc.name}'")

    # Combine conditions
    if conditions_list:
        return ' OR '.join(conditions_list)
    else:
        return "1=2"  # Ensures no documents are shown if no conditions are met
