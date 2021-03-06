let http = require("http")
let fs = require("fs")
let url = require("url")
let timers = require("timers")
let ws = require("ws")
let readline = require("readline")
let ip_lib = require("ip")

CARS = ["Car1", "Car2", "Car3", "Car4", "GuitarCar"]

READ = "Traffic.js"

port = -1

RANDOM_STRING_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"
function generateID() {
    res = ""
    for (var i=0; i < 20; i++) {
        ch = RANDOM_STRING_CHARS[0 | (Math.random() * RANDOM_STRING_CHARS.length)]
        res += ch
    }
    return res
}


if (process.argv.length > 2) {
    if (process.argv[2].match(/^[0-9]+$/)) {
        port = process.argv[2] | 0
        if (process.argv.length > 3) {
            READ = process.argv[3]
        }
    }
    else
        READ = process.argv[2]
}
if (port == -1) {
    port = 8000
}

try {
    fs.accessSync(READ)
} catch (err) {
    fs.writeFileSync(READ, "[]")
}

/*
 * Permissions and stuff:
 *  connect - Be able to connect to the sever
 *  view - Be able to view the traffic simulator
 *  place - Be able to place cars and interact
 *  police - Be able to place police cars
 *  command - Be able to run moderator commands
 *
 * Moderator commands:
 *  GRANT [ip] [permission] - Grant a specific permission to an IP
 *  DENY [ip] [permission] - Remove a specific permission from an IP
 *  QUERY [ip] [level] - Give a detailed info about an IP
 */

IP_INFO = {
    "::1": makeDefaultUser("loovjo")
}
IP_INFO["::1"].perms.add("build")
IP_INFO["::1"].perms.add("police")
IP_INFO["::1"].perms.add("command")

function id2idx(id) {
    for (var i = 0; i < traffic.roads.length; i++) {
        if (traffic.roads[i].id === id)
            return i
    }
    return -1
}

function makeDefaultPerms() {
    return new Set(["connect", "view", "place"])
}

function makeDefaultUser(name) {
    return {
        name: name,
        perms: makeDefaultPerms()
    }
}

SPAWN_RATE = 2

PERMISSION = new Set(["connect", "view", "place", "police", "build", "command", "moderator"])

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

// Pattern syntax is ,-separated cidr notation
function matches(ip, pattern) {
    pattern_parts = pattern.split(",")

    for (i = 0; i < pattern_parts.length; i++) {
        try {
            subnet = ip_lib.cidrSubnet(pattern_parts[i])
            if (subnet.contains(ip)) {
                return true
            }
        } catch (err) { }
        
        try {
            if (ip_lib.isEqual(ip, pattern_parts[i])) {
                return true
            }
        } catch (err) {  }

        if (pattern_parts[i] == "*") {
            return true
        }
        if (pattern_parts[i] == ip) {
            return true
        }
    }
    return false
}

function doCommand(ip, line) {

    if (DEBUG.has("cmd") && ip !== "") {
        console.log(ip + " is executing command " + line)
    }

    parts = line.split(" ")
    if (new Set(["GRANT", "DENY", "QUERY", "RM"]).has(parts[0])) {
        if (parts.length > 1) {
            selected = Object.keys(IP_INFO).filter(ip => matches(ip, parts[1]))
        }
        
        else 
            return "Invalid. Syntax is [command] [ip] ..."

        if (parts[0] === "GRANT") {
            if (parts.length != 3) {
                return "GRANT syntax: GRANT [ips] [permission]"
            }
            else {
                perm = parts[2]
                if (!PERMISSION.has(perm)) {
                    return "Can't find permission " + perm
                }
                if (perm == "command" || perm == "moderator") {
                    if (ip && !IP_INFO[ip].perms.has("moderator")) {
                        return "You do not have access to GRANT _ command/moderator"
                    }
                }
                selected.forEach(ip => IP_INFO[ip].perms.add(perm))

                if (selected.length === 0) {
                    return "Couldn't find any IPs that matches " + parts[1]
                }
                else {
                    return "Gave " + perm + " to " + selected.join(", ")
                }
            }
        }
        else if (parts[0] === "DENY") {
            if (parts.length != 3) {
                return "DENY syntax: DENY [ips] [permission]"
            }
            else {
                perm = parts[2]
                if (!PERMISSION.has(perm)) {
                    return "Can't find permission " + perm
                }
                if (perm == "command" || perm == "moderator") {
                    if (ip && !IP_INFO[ip].perms.has("moderator")) {
                        return "You do not have access to DENY _ command/moderator"
                    }
                }
                selected.forEach(ip => {
                    IP_INFO[ip].perms.delete(perm)
                })
                if (selected.length === 0) {
                    return "Couldn't find any IPs that matches " + parts[1]
                }
                else {
                    return "Denied " + perm + " from " + selected.join(", ")
                }
            }
        }
        else if (parts[0] === "QUERY") {
            if (parts.length != 2) {
                return "QUERY syntax: QUERY [ips]"
            }
            else {
                if (selected.length === 0) {
                    return "Couldn't find any IPs that matches " + parts[1]
                }
                return selected.map(ip => {
                    res = ip + "\n"
                    res += Object.keys(IP_INFO[ip]).map(prop => {
                        val = IP_INFO[ip][prop]
                        if (val instanceof Set)
                            val = [...val]
                        return "\t" + prop + ": " + JSON.stringify(val)
                    }).join("\n")
                    return res
                }).join("\n")
            }
        }
        else if (parts[0] === "RM") {
            if (parts.length != 2) {
                return "RM syntax: RM [ips]"
            }
            else {
                if (selected.length == 0) {
                    return "Found no ips matching " + parts[1]
                }
                res = "Deleted "
                selected.forEach(ip => {
                    delete IP_INFO[ip]
                    res += ip + " "
                })
                return res
            }
        }
    }
    else if (parts[0] === "MAKE") {
        if (parts.length != 3) {
            return "MAKE syntax: MAKE [ip] [name]"
        }
        else {
            user = makeDefaultUser(parts[2])
            IP_INFO[parts[1]] = user
            return "Made user " + parts[1] + "(" + parts[2] + ")"
        }
    }
    else if (parts[0] === "SAVE") {
        path = READ
        if (parts.length > 1) {
            path = parts[1]
        }
        toSave = {roads: JSON.parse(JSON.stringify(traffic.roads)), intersections: traffic.intersections}
        toSave.roads.forEach(road => {
            if (road.traffic_light) {
                road.traffic_light = {offset: road.traffic_light.offset,
                                      at: road.traffic_light.at}
            }
        })

        fs.writeFileSync(path, JSON.stringify(toSave, null, '    '))
        return "Wrote to " + path
    }
    else if (parts[0] === "DEBUG") {
        if (parts.length === 1) {
            return "Current debugs: " + Array.from(DEBUG).join(", ")
        }
        added = []
        removed = []
        res = ""

        parts.splice(1).forEach(param => {
            if (!DEBUGS.has(param)) {
                res += "Invalid debug parameter " + param + "\n"
            }
            else if (DEBUG.has(param)) {
                DEBUG.delete(param)
                removed.push(param)
            }
            else {
                DEBUG.add(param)
                added.push(param)
            }
        })

        if (added.length > 0)
            res += "Added " + added.join(", ")
        else
            res += "Added nothing"
        res += "\n"

        if (removed.length > 0)
            res += "Removed " + removed.join(", ")
        else
            res += "Removed nothing"

        return res.trim()
    } else if (parts[0] === "SPAWNRATE" && parts.length == 2) {
        SPAWN_RATE = parseFloat(parts[1])
        return "Set spawn rate to " + SPAWN_RATE
    }
    return "Couldn't find command " + parts[0] // Fallback

}

rl.on('line', function(line) {
    result = doCommand("", line)
    result.split("\n").forEach(line => console.log("  " + line))
})


/*
 * Car properties:
 *      name : String           The name of the car
 *      img : String            The image of the car. Implicit ".png" is added to the end
 *      pos : {                 The position of the car
 *          x : float,
 *          y : float
 *      }
 *      rot : float             The rotation of the car
 *      steering : float        How much the car rotates every tick
 *      accel : float           How fast the car accelerates. Changes the speed field
 *      speed : float           How fast the car moves every tick
 *      maxSpeed : float        Limits the speed
 *      hand_breaks : bool      If the hand breaks are down. If so, the car decelerates by break_strength every second
 *      break_strength : float  How much the car breaks every second if the hand_breaks are down
 *      crashed : bool          Has the car crashed? Loads a different texture if so
 *      fade : float            How much the car is fading away. 1 is no fade. Decreases when the ai is disabled and no one is driving the car
 *      ai : {                  The brain of the car. Optional
 *          road_queue : [          A list of roads that the car follows
 *              {road : int             The index of the road to follow
 *              backwards :  bool       If true, the car drives towards the start of the road
 *              }
 *          ]
 *          waiting : bool      If the car is waiting for at a traffic light
 *      }
 *      controlled_by : string  If the car is controlled by a player, this is that player's IP address.
 *      is_police : bool        Is the car a police car
 */

DEFAULT_CAR_PROPERTIES = {
    img: "Car1",
    pos: {x: 0, y: 0},
    rot: 0,
    steering: 0,
    speed: 0,
    accel: 0,
    maxSpeed: 6,
    hand_breaks: false,
    break_strength: 0.2,
    crashed: false,
    fade: 1
}


function init() {
    traffic = JSON.parse(fs.readFileSync(READ))
    if (traffic.constructor === Array) {
        traffic = {roads: traffic}
    }

    if (!traffic.cars) traffic.cars = []
    if (!traffic.roads) traffic.roads = []
    if (!traffic.intersections) traffic.intersections = []
    if (!traffic.timeUntilNextCar) traffic.timeUntilNextCar = 0
}
DEBUG = new Set([
    "cmd",
    // "AI",
    // "ws",
    // "http",
])

DEBUGS = new Set(["AI", "ws", "http", "cmd"])

init()

lastTime = Date.now()
totalTime = 0
carCount = 0

toRadians = (theta => theta * Math.PI / 180)
toDegrees = (theta => theta * 180 / Math.PI)

function distance(a, b) {
    dx = a.x - b.x
    dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
}

function add_car(car) {
    Object.keys(DEFAULT_CAR_PROPERTIES).forEach(prop => {
        if (car[prop] === undefined)
            car[prop] = DEFAULT_CAR_PROPERTIES[prop]
    })

    if (car.name === undefined) {
        car.name = "Car" + carCount
    }

    if (traffic.cars.filter(check => check.name === car.name).length === 0) {
        traffic.cars.push(car)
        return car.name
    }
    return undefined
}

function pathFind(start_id, end_id) { // Uses a weighted breadth-first search because I'm too lazy to make an actual A-star algorithm. TODO: Make this an A-star algorithm
    visited = new Set([])
    current_stack = [{path: [start_id], score: 0}]

    while (current_stack.length) {
        current = current_stack.splice(0, 1)[0]
        latest = current.path[current.path.length - 1]

        if (visited.has(latest))
            continue

        visited.add(latest)

        if (latest === end_id)
            return current.path

        road = traffic.roads[id2idx(latest)]
        if (road !== undefined) {
            road.connected_to.forEach(rId => {
                r = traffic.roads[id2idx(rId)]
                dx = r.start.x - r.end.x
                dy = r.start.y - r.end.y
                length = dx ** 2 + dy ** 2

                car_speed_on_road = traffic.cars.filter(car => {
                    if (!car.ai)
                        return false
                    if (!car.ai.road_queue)
                        return false
                    if (car.ai.road_queue.length == 0)
                        return false
                    return car.ai.road_queue[0] == rId
                }).map(car => car.speed)
                
                if (car_speed_on_road.length == 0) {
                    avg_speed = r.speed_rec
                }
                else {
                    avg_speed = car_speed_on_road.reduce((a, b) => a + b) / car_speed_on_road.length
                }

                new_score = current.score + length / avg_speed

                added = false
                for (var i = 0; i < current_stack.length; i++) {
                    if (current_stack[i].score > new_score) {
                        current_stack.splice(i, 0, {path: current.path.concat([rId]), score: new_score})
                        added = true
                        break
                    }
                }
                if (!added)
                    current_stack.push({path: current.path.concat([rId]), score: new_score})
            })
        }
    }
}

var physics = timers.setInterval(() => {
    delta = (Date.now() - lastTime) / 1000
    totalTime += delta
    lastTime = Date.now()

    traffic.roads.forEach(road => {
        if (!road.traffic_light)
            return

        road.traffic_light.waiting_cars = []

        if (road.traffic_light.green_left === undefined)
            road.traffic_light.green_left = 0

        if (road.traffic_light.green_left > 0) {
            road.traffic_light.green_left -= delta

            if (road.traffic_light.green_left <= 0) {
                road.traffic_light.green_left = 0
            }
        }
    })

    traffic.cars = traffic.cars.filter(car => traffic.cars.filter(check => car.name === check.name && car !== check).length === 0)

    traffic.roads.forEach(road => {
        road.connected_to = road.connected_to.filter(c => id2idx(c) !== -1) // Remove dead connections
    })

    traffic.cars = traffic.cars.map(car => {
        car = JSON.parse(JSON.stringify(car))

        theta = toRadians(car.rot)
        rx = Math.cos(theta) * delta * car.speed
        ry = Math.sin(theta) * delta * car.speed
        new_pos = {x: car.pos.x + rx, y: car.pos.y + ry}
        car.pos = new_pos

        car.speed += car.accel * delta

        if (car.speed > car.maxSpeed)
            car.speed = car.maxSpeed

        car.rot += car.steering * delta

        if (car.hand_breaks) {
            car.speed *= Math.pow(car.break_strength, delta)

            if (Math.abs(car.speed) < 0.3) {
                car.speed = 0
            }
            car.steering /= Math.pow(5, delta)
        }

        if (!car.crashed && !car.is_police) {
            crashingCars = traffic.cars.filter(car2 => car.name !== car2.name && distance(car.pos, car2.pos) < 0.8)
            if (crashingCars.length > 0) {
                collision = crashingCars[0]
                rotDiff = (car.rot - collision.rot + 180) % 360 - 180

                car.steering = rotDiff

                car.rot -= rotDiff / 3

                car.speed += collision.speed * Math.cos(toRadians(collision.rot - car.rot))

                car.crashed = true
                delete car.ai
                car.accel = 0
                delete car.controlled_by
            }

        }
        if (!car.ai && !car.controlled_by && !car.non_fade || car.crashed) {
            car.hand_breaks = true
            car.fade -= delta / 3
        }


        // Calculate AI
        
        if (!car.ai)
            return car

        // Check if road_queue is valid
        
        valid = true

        for (var i = 0; i < car.ai.road_queue.length - 1; i++) {
            road_id = car.ai.road_queue[i]
            road = traffic.roads[id2idx(road_id)]
            if (road === undefined) {
                valid = false
                break
            }

            next_id = car.ai.road_queue[i + 1]
            next = traffic.roads[id2idx(next_id)]

            if (road.connected_to.indexOf(next_id) == -1) {
                valid = false
            }
        }
        if (car.ai.road_queue.length == 0)
            valid = false

        if (car.ai.road_queue[-1] !== car.ai.destination)
            valid = false


        if (!valid) {
            path = pathFind(car.ai.road_queue[0], car.ai.destination)
            if (path !== undefined)
                car.ai.road_queue = path
        }

        if (!car.crashed && car.ai && car.ai.road_queue.length > 0) {

            current_path = car.ai.road_queue[0]
            idx = id2idx(current_path)
            road = traffic.roads[idx]

            if (road === undefined || idx === -1) {
                delete car.ai
                return car
            }

            road_delta = {x: road.end.x - road.start.x, y: road.end.y - road.start.y}
            road_rot = toDegrees(Math.atan2(road_delta.y, road_delta.x))

            if (road_delta.x == 0) {
                k = 1 / 0
                m = 0
                cx = road.start.x
                cy = car.pos.y
            }
            else {
                k = road_delta.y / road_delta.x
                m = road.start.y - k * road.start.x

                cx = (car.pos.x + k * car.pos.y - k * m) / (1 + k * k)
                cy = k * cx + m
            }
            closest = {x:cx, y:cy}

            if (distance(closest, road.start) + distance(closest, road.end) > distance(road.start, road.end) + 5) {
                if (distance(closest, road.start) < distance(closest, road.end))
                    closest = road.start
                else
                    closest = road.end
            }

            dist = distance(car.pos, closest)
            dist_exag = Math.exp(3 * dist) + 1

            // Steer car towards closest point

            towards = {x: (closest.x * dist_exag + road.end.x) / (dist_exag + 1),
                       y: (closest.y * dist_exag + road.end.y) / (dist_exag + 1)}


            wanted_rot = (toDegrees(Math.atan2(car.pos.y - towards.y,
                                               car.pos.x - towards.x
                                    ))) % 360 + 180

            car.steering = (wanted_rot - car.rot)

            car.steering = ((car.steering + 180) % 360 - 180) * 5

            dwx = road.end.x - car.pos.x
            dwy = road.end.y - car.pos.y
            dist_to_finish = Math.sqrt(dwx * dwx + dwy * dwy)

            // How far would the car go if the breaks were all down? Use the geometric series b+b^2+b^3... where b = break factor
            break_dist = 2 * (car.speed * car.break_strength / (1 + car.break_strength) + 1)

            // What cars are in front?
            cars_in_front = traffic.cars.filter(check => {
                if (check.name === car.name)
                    return false

                if (distance(car.pos, check.pos) > break_dist * 1.5)
                    return false

                pos_delta = {x: car.pos.x - check.pos.x, y: car.pos.y - check.pos.y}
                delta_angle = toDegrees(Math.atan2(pos_delta.y, pos_delta.x))
                angle_diff = car.rot - delta_angle + 180

                while (angle_diff > 180)
                    angle_diff -= 360


                return Math.abs(angle_diff) < 15
            })

            car.hand_breaks = false

            if (road.traffic_light) {
                car.ai.waiting = true
            }
            else {
                car.ai.waiting = false
            }

            // Check if there's a traffic light
            if (road.traffic_light && road.traffic_light.green_left <= 0 && dist_to_finish < break_dist * 1.5) {
                car.hand_breaks = true
                car.accel = (dist_to_finish - break_dist * 1.5) / 3
            }

            else if (cars_in_front.length > 0) {
                if (DEBUG.has("AI"))
                    console.log(car.name + " is behind " + cars_in_front.map(car => car.name))
                // Match the speed
                avg_speed = cars_in_front.map(check_car => check_car.speed * Math.cos(toRadians(check_car.rot - car.rot))).reduce((a, b) => a + b) / cars_in_front.length
                min_dist = cars_in_front.map(check_car => distance(car.pos, check_car.pos)).reduce((a, b) => a < b ? a : b)

                if (avg_speed < car.speed - 4 && avg_speed > 0) {
                    car.hand_breaks = true
                }

                car.accel = (avg_speed - car.speed) * 3

                if (min_dist < 5 && avg_speed > 0) {
                    car.hand_breaks = true
                    car.accel = 0
                }

                any_waiting = cars_in_front.map(car => car.ai && car.ai.waiting || car.controlled_by).reduce((a, b) => (a || b))
                car.ai.waiting |= any_waiting
            }
            else {
                car.accel = (road.speed_rec - car.speed) * 5
                if (DEBUG.has("AI"))
                    console.log(car.name + " is accelling from " + car.speed + " to " + road.speed_rec + " with " + car.accel)
            }
            if (road.traffic_light && car.ai.waiting) {
                road.traffic_light.waiting_cars.push(car)
            }

            if (dist_to_finish < 1) {
                car.ai.road_queue.shift()
                if (car.ai.road_queue.length == 0) {
                    delete car.ai
                }
            }

            car.fade = 1
        }
        return car
    }).filter(car => {
        if (car.fade <= 0) return false
        if (car.controlled_by !== undefined) {
            if (IP_INFO[car.controlled_by] !== undefined) {
                return IP_INFO[car.controlled_by].perms.has("place")
            }
        }
        return true
    })

    traffic.intersections.forEach(intersection => {
        any_green = false

        max_score = 0
        max_cars_id = null
        roads = intersection.roads

        for (i = 0; i < roads.length; i++) {
            road_id = roads[i]

            road = traffic.roads[id2idx(road_id)]
            if (road === undefined)
                continue

            if (!road.traffic_light)
                continue

            amount_of_cars = road.traffic_light.waiting_cars.length

            if (road.traffic_light.last_green === undefined)
                road.traffic_light.last_green = 0

            score = amount_of_cars * (totalTime - road.traffic_light.last_green)

            if (road.traffic_light.green_left > 0) {
                any_green = true
                max_cars_id = road_id
                break
            }

            if (score > max_score || max_cars_id == null) {
                max_cars_id = road_id
                max_score = score
            }
            else if (score == max_score) {
                other_time = traffic.roads[id2idx(max_cars_id)].traffic_light.last_green

                if (road.traffic_light.last_green < other_time)
                    max_cars_id = road_id
            }

        }

        if (!any_green && max_score > 0) {

            if (traffic.roads[id2idx(max_cars_id)] !== undefined) {
                light = traffic.roads[id2idx(max_cars_id)].traffic_light
                light.green_left = light.waiting_cars.length + 2
                light.last_green = totalTime
            }
        }

    })

    traffic.timeUntilNextCar -= delta
    if (traffic.roads.length > 0 && traffic.timeUntilNextCar <= 0) {
        traffic.timeUntilNextCar = SPAWN_RATE

        // Add new car

        attempt = 200

        do {
            start_id = traffic.roads[Math.random() * traffic.roads.length | 0].id
            attempt -= 1
        } while ((
                traffic.roads.map(road => road.connected_to.indexOf(start_id) != -1).reduce((a, b) => a || b) ||
                traffic.cars.length > 0 && !traffic.cars.map(car => distance(car.pos, traffic.roads[id2idx(start_id)].start) > 2).reduce((a, b) => a && b)
            ) && attempt > 0
        )

        if (attempt != 0) {
            start = traffic.roads[id2idx(start_id)]
            start_rot = toDegrees(Math.atan2(start.end.y - start.start.y, start.end.x - start.start.x))

            attempt = 200
            do {
                end_id = traffic.roads[Math.random() * traffic.roads.length | 0].id
                attempt -= 1
            } while (
                traffic.roads[id2idx(end_id)].connected_to.length > 0
                && attempt > 0
            )

            texture = CARS[Math.random() * CARS.length | 0]
            if (attempt != 0) {
                car = {
                    name: "Car" + carCount,
                    img: texture,
                    pos: start.start,
                    rot: start_rot,
                    accel: 0,
                    speed: 0,
                    size: 1 + (texture == "GuitarCar"),
                    maxSpeed: 8,
                    steering: 0,
                    hand_breaks: false,
                    break_strength: 0.2,
                    crashed: false,
                    is_police: false,
                    ai: {
                        waiting: false,
                        road_queue: [start_id],
                        destination: end_id
                    },
                }
                add_car(car)

                carCount += 1

            }

        }
    }

    // if (totalTime > 20) {
    //     totalTime = 0
    //     init()
    //     console.log("Reset!")
    // }
}, 40)

var server = http.createServer((req, res) => {
    method = req.method
    url = url.parse(req.url)
    ip  = req.connection.remoteAddress

    if (method === "GET") {
        if (IP_INFO[ip] !== undefined) {
            if (!IP_INFO[ip].perms.has("connect")) {
                return
            }
        }
        filePath = "Web" + url.pathname
        if (fs.existsSync(filePath)) {
            if (DEBUG.has("http"))
                console.log(method + " " + url.href)

            if (!fs.lstatSync(filePath).isFile()) {
                filePath = "Web/traffic.html"
            }
            content = fs.readFileSync(filePath)
            res.setHeader("Content-Type", "text/html")
            res.end(content)
        } else {
            if (DEBUG.has("http"))
                console.log(method + " " + url.href + " (NOEXIST!)")
            res.end("NOEXIST!")
        }
    }
})

server.listen(port)
console.log("Started Server on port " + port + " using reading from save " + READ)

var wss = new ws.Server({server: server})


var broadcast = timers.setInterval(() => {

    wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) {
            ip = client._socket.remoteAddress || client.upgradeReq.connection.remoteAddress
            
            if (IP_INFO[ip]) {
                permissions = IP_INFO[ip].perms || []
            }
            else {
                permissions = makeDefaultPerms()
            }

            if (permissions.has("view")) {
                traffic["you"] = {ip: ip, info: {loggedIn: IP_INFO[ip] !== undefined, perms: [...permissions]}}
                traffic["others"] = Object.keys(IP_INFO).map(ip => {return {ip: ip, name: IP_INFO[ip].name}})
                traffic.cars.forEach(car => {
                    if (car.steering == null)
                        car.steering = 0
                    if (car.pos.x == null)
                        car.pos.x = 0
                    if (car.pos.y == null)
                        car.pos.y = 0
                    if (car.accel == null)
                        car.accel = 0
                    if (car.vel == null)
                        car.vel = 0
                })

                client.send(JSON.stringify(traffic))
            }
            else {
                client.send(JSON.stringify({cars: [], roads: [], you: {ip: ip, info: {perms: []}}}))
            }
        }
        delete traffic["you"]
    })
}, 100)

wss.on('connection', (socket => {

    socket.on('message', (data, flags) => {
        ip = socket._socket.remoteAddress || socket.upgradeReq.connection.remoteAddress

        if (IP_INFO[ip]) {
            permissions = IP_INFO[ip].perms || []
        }
        else {
            permissions = makeDefaultPerms()
        }

        if (!permissions.has("connect")) {
            socket.close()
        }

        parts = data.split("/")

        if (DEBUG.has("ws"))
            console.log("Recieved " + data + " from " + ip)

        if (parts.length > 0) {
            cmd = parts[0]
            if (cmd === "claim" && parts.length > 1) {
                carName = parts[1]
                cars = traffic.cars.filter(car => car.name == carName)
                cars.forEach(car => car.controlled_by = ip)
            }
            else if (cmd === "create" && parts.length == 2 && permissions.has("place")) {
                proto_car = JSON.parse(decodeURIComponent(parts[1]))

                car = JSON.parse(JSON.stringify(DEFAULT_CAR_PROPERTIES))
                car.img = proto_car.img
                car.pos = proto_car.pos

                if (permissions.has("police") && proto_car.is_police) {

                    car.is_police = proto_car.is_police
                    car.maxSpeed = 10
                    car.break_strength = 0.1
                    car.img = "CarPolis"
                }
                else if (car.img === "CarPolis") {
                    car.img = "Car1"
                    car.maxSpeed = 8
                    car.break_strength = 0.2
                }
                car.controlled_by = ip

                add_car(car)
            }
            else if (cmd === "createai" && parts.length == 3 && permissions.has("place")) { // createai/rIDstart/rIdend

                texture = CARS[Math.random() * CARS.length | 0]
                start_id = parts[1]
                start = traffic.roads[id2idx(start_id)]
                start_rot = toDegrees(Math.atan2(start.end.y - start.start.y, start.end.x - start.start.x))

                end_id = parts[2]
                end = traffic.roads[id2idx(end_id)]

                car = {
                    name: "AiCar" + carCount,
                    img: texture,
                    pos: start.start,
                    rot: start_rot,
                    accel: 0,
                    speed: 0,
                    size: 1 + (texture == "GuitarCar"),
                    maxSpeed: 8,
                    steering: 0,
                    hand_breaks: false,
                    break_strength: 0.2,
                    crashed: false,
                    is_police: false,
                    ai: {
                        waiting: false,
                        road_queue: [start_id],
                        destination: end_id
                    },
                    controlled_by: ip
                }
                add_car(car)

                carCount += 1
            }

            else if (cmd === "remove" && parts.length > 1) {
                carName = parts[1]
                traffic.cars = traffic.cars.filter(car => {
                    return !(car.controlled_by === ip && car.name == carName)
                })
            }
            else if (cmd === "cmd" && parts.length == 2) {
                if (permissions.has("command")) {
                    res = doCommand(ip, parts[1])
                }
                else {
                    res = "You do not have access to use moderator commands"
                }
                socket.send(JSON.stringify({res: res}))
            }
            else if (cmd === "rbuild" && parts.length == 5 && permissions.has("build")) { // build/x1/y1/x2/y2
                poses = parts.splice(1).map(x => parseFloat(x))
                road = {
                    id: generateID(),
                    width: 1.5,
                    start: {x:poses[0],y:poses[1]},
                    end: {x:poses[2],y:poses[3]},
                    connected_to: [],
                    speed_rec: 5
                }
                traffic.roads.push(road)
            }
            else if (cmd === "rflip" && parts.length == 2 && permissions.has("build")) { // rflip/id
                idx = id2idx(parts[1])
                if (idx < traffic.roads.length) {
                    start = traffic.roads[idx].start
                    traffic.roads[idx].start = traffic.roads[idx].end
                    traffic.roads[idx].end = start
                }
            }
            else if (cmd === "rrm" && parts.length == 2 && permissions.has("build")) { // rrm/id
                idx = id2idx(parts[1])

                traffic.roads.splice(idx, 1)

                traffic.roads.forEach(road => {road.connected_to = road.connected_to.filter(id => id != parts[1])})
            }
            else if (cmd === "lbuild" && parts.length == 2 && permissions.has("build")) { // lbuild/id
                road = traffic.roads[id2idx(parts[1])]
                if (!road.traffic_light) {
                    traffic.roads[id2idx(parts[1])].traffic_light = {offset: 1, at: 1}
                }
            }
            else if (cmd === "lrm" && parts.length == 2 && permissions.has("build")) { // lrm/id
                road = traffic.roads[id2idx(parts[1])]
                if (road.traffic_light) {
                    delete traffic.roads[id2idx(parts[1])].traffic_light
                }
                traffic.intersection.forEach(inter => {
                    inter.roads = inter.roads.filter(road => parts[1])
                })
            }
            else if (cmd === "lflip" && parts.length == 2 && permissions.has("build")) { // lflip/id
                road = traffic.roads[id2idx(parts[1])]
                if (road.traffic_light) {
                    traffic.roads[id2idx(parts[1])].traffic_light.offset *= -1
                }
            }
            else if (cmd === "rconn" && parts.length == 3 && permissions.has("build")) { // rconn/id1/id2
                roads = parts.slice(1).map(id2idx)

                if (traffic.roads[roads[0]].connected_to.indexOf(parts[2]) !== -1) {
                    traffic.roads[roads[0]].connected_to = traffic.roads[roads[0]].connected_to.filter(a => a !== parts[2])
                }
                else {
                    traffic.roads[roads[0]].connected_to.push(parts[2])
                }
            }
            else if (cmd === "intermake" && parts.length == 3 && permissions.has("build")) { // intermake/id1/id2
                road1 = traffic.roads[id2idx(parts[1])]
                road2 = traffic.roads[id2idx(parts[2])]

                if (road1 === undefined || road2 === undefined) {
                    return
                }
                if (road1.traffic_light === undefined || road2.traffic_light === undefined)
                    return
                
                added = false

                traffic.intersections.forEach(inter => {
                    r1in = inter.roads.indexOf(parts[1]) != -1
                    r2in = inter.roads.indexOf(parts[2]) != -1


                    if (r1in && !r2in) {
                        inter.roads.push(parts[2])
                        added = true
                    }
                    else if (!r1in && r2in) {
                        added = true
                        inter.roads.push(parts[1])
                    }
                    else if (r1in && r2in) {
                        added = true
                        inter.roads.splice(inter.roads.indexOf(parts[1]), 1)
                        inter.roads.splice(inter.roads.indexOf(parts[2]), 1)
                    }
                })

                if (!added) (
                    traffic.intersections.push({roads: [parts[1], parts[2]]})
                )

            }
            else if (cmd === "login" && parts.length == 2) { // login/name
                user = makeDefaultUser(parts[1])
                IP_INFO[ip] = user
            }

            else {
                cars = traffic.cars.filter(car => car.controlled_by === ip)

                if (cmd === "steer" && parts.length > 1) {
                    rot = parseFloat(parts[1])
                    cars.forEach(car => car.steering = rot)
                }
                if (cmd === "accel" && parts.length > 1) {
                    accel = parseFloat(parts[1])
                    cars.forEach(car => car.accel = accel)
                }
                if (cmd === "breaks") {
                    cars.forEach(car => car.hand_breaks = true)
                }
                if (cmd === "no_breaks") {
                    cars.forEach(car => car.hand_breaks = false)
                }
            }
        }

    })
}))