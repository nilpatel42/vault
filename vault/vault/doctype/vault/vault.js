// Copyright (c) 2024, NDV and contributors
// For license information, please see license.txt


frappe.ui.form.on('Vault', {
    refresh: function(frm) {
        // Hide all buttons initially
        frm.set_df_property('create_new_password', 'hidden', true);
        frm.set_df_property('change_ownership', 'hidden', true);

        // Check if the form is a new document
        if (frm.doc.__islocal) {
            frm.set_df_property('generate_strong_password', 'hidden', false);
        } else {
            frm.set_df_property('generate_strong_password', 'hidden', true);
            frm.set_df_property('password', 'read_only', true);

            // Only show 'Change Password' and 'Change Ownership' buttons if the user has appropriate permissions
            if (frappe.session.user == 'Administrator' || frm.doc.credentials_owner == frappe.session.user) {
                frm.add_custom_button(__('Change Password'), function() {
                    create_new_password_dialog(frm, false);
                }, 'Actions');

                frm.add_custom_button(__('Change Ownership'), function() {
                    change_credential_ownership(frm);
                }, 'Actions');
            } else {
                set_fields_read_only(frm);
            }

            // Show 'Show Password' button if conditions are met
            if (check_user_exist_in_list(frm) && frm.doc.docstatus < 2) {
                frm.add_custom_button(__('🔐 Show Password'), function() {
                    get_my_password(frm);
                });

                frm.set_df_property('create_new_password', 'hidden', false);
            }

            // Hide the 'username' field if the user is not admin, owner, or authorized
            if (!check_user_exist_in_list(frm)) {
                frm.set_df_property('username', 'hidden', true);
				frm.set_df_property('password', 'hidden', true);
				frm.set_df_property('ensure_strong_password', 'hidden', true);
				frm.set_df_property('url', 'hidden', true);
				frm.set_df_property('quick_navigate', 'hidden', true);
            } else {
                frm.set_df_property('username', 'hidden', false);
				frm.set_df_property('password', 'hidden', false);
				frm.set_df_property('ensure_strong_password', 'hidden', false);
				frm.set_df_property('url', 'hidden', false);
				frm.set_df_property('quick_navigate', 'hidden', false);
            }
        }
    },
    password: function(frm) {
        frappe.call({
            doc: frm.doc,
            method: 'check_my_password_strength',
            callback: function(r) {
                frm.set_value('password_strength', r.message ? r.message : '');
            }
        });
    },
    password_strength: function(frm) {
        let strength_list = {'Weak': 'red', 'Good': 'orange', 'Strong': 'green'};
        let description = '';
        if (frm.doc.password_strength) {
            description = '<font color="'+strength_list[frm.doc.password_strength]+'">'+__(frm.doc.password_strength)+'</font>';
        }
        frm.set_df_property('password', 'description', description);
    },
    url: function(frm) {
        frappe.call({
            doc: frm.doc,
            method: 'validate_my_url',
            callback: function(r) {
                let description = '';
                if (r.message) {
                    frm.set_value("valid_url", true);
                    frm.set_df_property('url', 'description', '');
                }
                if (!r.message && frm.doc.url) {
                    frm.set_value("valid_url", false);
                    frm.set_df_property('url', 'description', '<font color="red">Not Valid Url (Example: https://domain.com)</font>');
                }
            }
        });
    },
    password_category: function(frm) {
        if (frm.doc.vault_category) {
            frappe.db.get_value('Vault Category', frm.doc.vault_category, 'ensure_strong_password', function(r) {
                if (r && r.ensure_strong_password) {
                    frm.set_value('ensure_strong_password', r.ensure_strong_password);
                } else {
                    frm.set_value('ensure_strong_password', false);
                }
            });
        } else {
            frm.set_value('ensure_strong_password', false);
        }
    },
    quick_navigate: function(frm) {
        // Open in new window
        window.open(frm.doc.url);
    },
    generate_strong_password: function(frm) {
        create_new_password_dialog(frm, true);
    }
});







frappe.ui.form.on('Vault User', {
	authorized_users_list_remove: function(frm) {
		restrict_user_add_remove(frm);
	},
	authorized_users_list_add: function(frm) {
		restrict_user_add_remove(frm);
	}
});

var set_fields_read_only = function(frm) {
	var fields_list = frappe.meta.docfield_list[frm.doc.doctype];
	for (var i = 0; i < fields_list.length; i++) {
		frm.set_df_property(fields_list[i].fieldname, "read_only", true);
	}
};

var restrict_user_add_remove = function(frm) {
	if (frappe.session.user != 'Administrator' && frappe.session.user != frm.doc.credentials_owner) {
		frappe.msgprint(__("Not permitted, Only Administrator can add or delete user"));
		frm.reload_doc();
	}
};

var create_new_password_dialog = function(frm, is_new) {
	var common_fields = [
		{ fieldtype: 'Button', fieldname: 'generate_password', label: 'Generate Strong Password',
			click: function() {
				generate_password(frm, d);
			}
		},
		{ fieldtype: 'Data', reqd: 1, fieldname: 'new_password', label: 'New Password'},
		{ fieldtype: 'Check', reqd: 1, fieldname: 'make_sure_password_copied', label: 'Make sure the password is copied'}
	];
	var fields = [];
	var primary_action_label = 'Set Password';
	if (!is_new) {
		fields = [{ fieldtype: 'Password', reqd: 1, fieldname: 'password', label: 'Password'}];
		primary_action_label = 'Update Password';
	}
	fields = fields.concat(common_fields);
	var d = new frappe.ui.Dialog({
		title: __("Create Strong Password"),
		fields: fields,
		primary_action_label: __(primary_action_label),
		primary_action: function() {
			if (d.get_value('make_sure_password_copied') == 1) {
				set_new_password(frm, d, is_new);
			} else {
				frappe.msgprint(__("Make sure the password is copied"));
			}
		}
	});
	d.show();
};

var set_new_password = function(frm, d, is_new) {
	if (is_new) {
		frm.set_value('password', d.get_value('new_password'));
		d.hide();
	} else {
		frappe.call({
			doc: frm.doc,
			method: 'set_new_password',
			args: {'old_password': d.get_value('password'), 'new_password': d.get_value('new_password')},
			callback: function(r) {
				if (r.message) {
					d.hide();
				}
			},
			freeze: true,
			freeze_message: __("Updating Password......")
		});
	}
};

var generate_password = function(frm, d) {
	frappe.call({
		doc: frm.doc,
		method: 'generate_password',
		callback: function(r) {
			if (r && r.message) {
				d.set_values({'new_password': r.message});
			} else {
				d.set_values({'new_password': ''});
			}
		}
	});
};

var generate_strong_password_dialog = function(frm) {
	var d = new frappe.ui.Dialog({
		title: __("Generate Strong Password"),
		fields: [
			{ fieldtype: 'Button', fieldname: 'generate_password', label: 'Generate Password',
				click: function() {
					generate_password(frm, d);
				}
			},
			{ fieldtype: 'Data', reqd: 1, read_only: 1, fieldname: 'new_password', label: 'New Password'},
			{ fieldtype: 'Check', reqd: 1, fieldname: 'make_sure_password_copied', label: 'Make sure the password is copied'},
		],
		primary_action_label: __("Set Password"),
		primary_action: function() {
			if (d.get_value('make_sure_password_copied') == 1) {
				frm.set_value('password', d.get_value('new_password'));				
				d.hide();
				frappe.msgprint(__("Password has been updated successfully."));
			} else {
				frappe.msgprint(__("Make sure the password is copied"));
			}
		}
	});
	d.show();
};

var get_my_password = function(frm) {
    if (frm.doc.docstatus < 2) {
        frappe.call({
            doc: frm.doc,
            method: 'get_my_password',
            callback: function(r) {
                if (r && r.message) {
                    var d = new frappe.ui.Dialog({
                        title: __("View Password"),
                        fields: [
                            { 
                                fieldtype: 'Password', 
                                fieldname: 'my_password', 
                                label: __('Password')
                            }
                        ]
                    });

                    // Set the retrieved password in the password field
                    d.fields_dict.my_password.set_input(r.message);
                    
                    // Disable the field to prevent editing
                    $(d.fields_dict.my_password.input).prop('disabled', true);
                    
                    d.show();

                    // Copy to clipboard when the dialog is first shown
                    copyToClipboard(r.message);
                    frappe.show_alert({
                        message: __("Password is copied to clipboard!"),
                        indicator: 'green'
                    });
                }
            }
        });
    }
};



// To copy to clipboard
var copyToClipboard = function(secretInfo) {
	var $body = document.getElementsByTagName('body')[0];
	var $tempInput = document.createElement('INPUT');
	$body.appendChild($tempInput);
	$tempInput.setAttribute('value', secretInfo);
	$tempInput.select();
	document.execCommand('copy');
	$body.removeChild($tempInput);
};

var change_credential_ownership = function(frm) {
	if(frm.doc.credentials_owner){
		var d = new frappe.ui.Dialog({
			title: __("Change Ownership"),
			fields: [
				{ label: 'New Credentials Owner', fieldtype: 'Link', reqd: 1, fieldname: 'new_owner', options: 'User'}
			],
			primary_action_label: __("Change"),
			primary_action: function() {
				frappe.confirm(__('Permanently Change the Credentials Owner?'),
					function() {
						frm.set_value('credentials_owner', d.get_value('new_owner'));
						frm.save();
						d.hide();
					},
					function() {
						d.hide();
					}
				);
			}
		});
		d.set_values({'new_owner': frm.doc.credentials_owner});
		d.show();
	}
}

var check_user_exist_in_list = function(frm) {
	let user_exist = false;
	if (frappe.session.user == 'Administrator' || frappe.session.user == frm.doc.credentials_owner) {
		user_exist = true;
	}
	if (frm.doc.authorized_users_list) {
		frm.doc.authorized_users_list.forEach((user, i) => {
			if (user.user == frappe.session.user) {
				user_exist = true;
			}
		});
	}
	return user_exist;
};

frappe.ui.form.on('Vault', {
    refresh(frm) {
        const user = frappe.session.user;
        const isAuthorizedUser = frm.doc.authorized_users_list && frm.doc.authorized_users_list.some(userEntry => userEntry.user === user);
        
        if (user !== "Administrator" && user !== frm.doc.credentials_owner && !isAuthorizedUser) {
            frappe.set_route('List', 'Vault');
        }
    }
});

frappe.ui.form.on('Vault', {
    refresh: function (frm) {
        // Check if the form is in bulk edit mode
        if (frm.is_new()) return;

        if (frm.bulk_edit) {
            frm.fields_dict['password'].df.read_only = true;
            frm.refresh_field('password');
        }
    }
});


