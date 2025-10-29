routerAdd('GET','/unsplash/health', function(e){
  try {
    var res = $http.send({ url: 'http://127.0.0.1:8090/api/health', method: 'GET', timeout: 5000 });
    var body = res.body || '{}';
    try { body = JSON.parse(body); } catch(_){ body = { raw: res.body||'' }; }
    return e.json(res.statusCode||200, body);
  } catch(err) { return e.json(500, { message: String(err) }); }
});
