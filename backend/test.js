fetch ('http://localhost:5000/api/entry', {
    method: "POST",
    headers:{
         "Content-Type": "application/json"},
    body: JSON.stringify({
      username: "lia",
      lastname: "madeson",
      genres : "horror",
      theatres: "phoenix",
      moviename: "zombiehunters"
    })
    }
)

.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));