function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      user: req.session.user,
      activeNav: '',
      message: 'এই কাজটি শুধু অ্যাডমিন করতে পারবেন।'
    });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
