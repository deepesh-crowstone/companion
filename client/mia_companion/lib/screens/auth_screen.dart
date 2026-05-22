import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../config.dart';
import '../data/mia_profile.dart';
import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import 'chat_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, this.initialRegister = true});

  final bool initialRegister;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  late bool _isRegister = widget.initialRegister;
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  String? _error;
  bool? _serverReachable;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _checkServer();
  }

  Future<void> _checkServer() async {
    final ok = await ApiService.instance.checkHealth();
    if (mounted) setState(() => _serverReachable = ok);
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      if (_isRegister) {
        await ApiService.instance.register(
          _username.text.trim(),
          _password.text,
        );
      } else {
        await ApiService.instance.login(
          _username.text.trim(),
          _password.text,
        );
      }

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ChatScreen()),
      );
    } catch (e) {
      setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _friendlyError(Object e) {
    final raw = e.toString().replaceFirst('Exception: ', '');
    if (raw.contains('Cannot reach server')) {
      if (isProductionApi) {
        return 'can\'t reach ${MiaProfile.name.toLowerCase()}\'s server. on your phone open $resolvedApiBaseUrl/health — if that fails, set private DNS to automatic or dns.google, then try again.';
      }
      return 'can\'t reach the server. run npm run dev on your mac, then use flutter run with your mac\'s ip.';
    }
    if (raw.contains('Username already taken')) {
      return 'that username is taken — try another.';
    }
    if (raw.contains('Invalid username or password')) {
      return 'wrong username or password.';
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/auth_background.png',
            fit: BoxFit.cover,
            alignment: Alignment.centerLeft,
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  MiaColors.background.withValues(alpha: 0.15),
                  MiaColors.background.withValues(alpha: 0.45),
                  MiaColors.background.withValues(alpha: 0.88),
                ],
                stops: const [0.0, 0.42, 1.0],
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Colors.transparent,
                  MiaColors.background.withValues(alpha: 0.35),
                  MiaColors.background.withValues(alpha: 0.82),
                ],
                stops: const [0.0, 0.55, 1.0],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                if (_serverReachable == false)
                  _OfflineBanner(onRetry: _checkServer),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final wide = constraints.maxWidth >= 720;
                      return Align(
                        alignment:
                            wide ? Alignment.centerRight : Alignment.bottomCenter,
                        child: SingleChildScrollView(
                          padding: EdgeInsets.fromLTRB(
                            wide ? constraints.maxWidth * 0.42 : 28,
                            wide ? 24 : 16,
                            28,
                            28,
                          ),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              maxWidth: wide ? 420 : double.infinity,
                            ),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: MiaColors.surface.withValues(alpha: 0.72),
                                borderRadius: BorderRadius.circular(28),
                                border: Border.all(
                                  color: MiaColors.miaBubble.withValues(alpha: 0.6),
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: MiaColors.accentDeep.withValues(alpha: 0.08),
                                    blurRadius: 24,
                                    offset: const Offset(0, 8),
                                  ),
                                ],
                              ),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                                child: _buildForm(),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('zara', style: MiaTheme.serifTitle(size: 44)),
          const SizedBox(height: 8),
          Text(
            _isRegister ? 'create your account' : 'welcome back',
            style: GoogleFonts.inter(
              color: MiaColors.statusPink,
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 32),
          TextFormField(
            controller: _username,
            decoration: const InputDecoration(
              hintText: 'username',
              prefixIcon: Icon(Icons.person_outline, size: 22),
            ),
            textInputAction: TextInputAction.next,
            autocorrect: false,
            validator: (v) {
              final t = v?.trim() ?? '';
              if (t.length < 3) return 'at least 3 characters';
              if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(t)) {
                return 'letters, numbers, underscore only';
              }
              return null;
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _password,
            obscureText: _obscurePassword,
            decoration: InputDecoration(
              hintText: 'password',
              prefixIcon: const Icon(Icons.lock_outline, size: 22),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  size: 22,
                ),
                onPressed: () => setState(
                  () => _obscurePassword = !_obscurePassword,
                ),
              ),
            ),
            onFieldSubmitted: (_) => _submit(),
            validator: (v) {
              if ((v?.length ?? 0) < 6) {
                return 'at least 6 characters';
              }
              return null;
            },
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: MiaColors.accentDeep.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: MiaColors.accentDeep.withValues(alpha: 0.2),
                ),
              ),
              child: Text(
                _error!,
                style: GoogleFonts.inter(
                  color: MiaColors.accentDeep,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ),
          ],
          const SizedBox(height: 28),
          FilledButton(
            onPressed: (_loading || _serverReachable == false) ? null : _submit,
            child: _loading
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(_isRegister ? 'sign up' : 'log in'),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: _loading
                ? null
                : () => setState(() {
                      _isRegister = !_isRegister;
                      _error = null;
                    }),
            child: Text(
              _isRegister
                  ? 'already have an account? log in'
                  : 'new here? create account',
              style: GoogleFonts.inter(
                color: MiaColors.accentDeep,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MiaColors.accentDeep.withValues(alpha: 0.12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            const Icon(Icons.wifi_off_rounded, size: 18, color: MiaColors.accentDeep),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'can\'t reach server at $resolvedApiBaseUrl',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: MiaColors.accentDeep,
                  height: 1.3,
                ),
              ),
            ),
            TextButton(
              onPressed: onRetry,
              child: Text(
                'retry',
                style: GoogleFonts.inter(
                  color: MiaColors.accentDeep,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
