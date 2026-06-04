import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import '../utils/account_auth_validation.dart';
import '../widgets/mia_background.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLoggedIn});

  final VoidCallback onLoggedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final username = _usernameController.text;
    final password = _passwordController.text;
    final usernameErr = AccountAuthValidation.usernameError(username);
    final passwordErr = AccountAuthValidation.passwordError(password);
    if (usernameErr != null || passwordErr != null) {
      setState(() => _error = usernameErr ?? passwordErr);
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final reachable = await ApiService.instance.checkHealth().timeout(
        const Duration(seconds: 12),
        onTimeout: () => false,
      );
      if (!reachable) {
        throw Exception(ApiService.userConnectionErrorMessage);
      }

      await ApiService.instance.login(username.trim(), password);
      if (!mounted) return;
      widget.onLoggedIn();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = ApiService.friendlyErrorMessage(e);
      });
      return;
    }

    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: MiaColors.background,
      body: MiaBackground(
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                  color: MiaColors.textPrimary,
                  onPressed: _loading ? null : () => Navigator.of(context).pop(),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(28, 8, 28, 24),
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Welcome back',
                        style: MiaTheme.serifTitle(size: 36),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Log in with the username and password you set after unlocking personalities.',
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          height: 1.45,
                          color: MiaColors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 28),
                      TextField(
                        controller: _usernameController,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.none,
                        decoration: const InputDecoration(
                          labelText: 'Username',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword,
                            ),
                          ),
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          _error!,
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: MiaColors.accentDeep,
                          ),
                        ),
                      ],
                      const SizedBox(height: 28),
                      FilledButton(
                        onPressed: _loading ? null : _submit,
                        child: _loading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Log in'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
