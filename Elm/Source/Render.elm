module Render exposing (renderRoads, renderCars, renderTrafficLights, renderBackgroundLines)

import Base exposing (..)
import Svg as S
import Svg.Attributes as Sa

renderRoads : Model -> List (S.Svg Msg)
renderRoads model =
    (
        List.map (\road ->
            S.line
            [ Sa.x1 <| toString <| (road.start.x * model.renderScale) + model.scroll.x
            , Sa.y1 <| toString <| (road.start.y * model.renderScale) + model.scroll.y
            , Sa.x2 <| toString <| (road.end.x * model.renderScale) + model.scroll.x
            , Sa.y2 <| toString <| (road.end.y * model.renderScale) + model.scroll.y
            , Sa.strokeWidth <| toString <| model.renderScale * road.width + 2
            , Sa.stroke "gray"
            ] []
        )
        model.roads
    ) ++ renderRoadsCaps model
      ++ renderRoadLines model

renderRoadsCaps : Model -> List (S.Svg Msg)
renderRoadsCaps model =
        List.concatMap (\road ->
                List.concatMap (\idx ->
                        let maybeOtherRoad = model.roads !! idx
                        in case maybeOtherRoad of
                            Just otherRoad ->
                                let roadRot = (Tuple.second <| toPolar (road.end.x - road.start.x, road.end.y - road.start.y))
                                    otherRoadRot = (Tuple.second <| toPolar (otherRoad.end.x - otherRoad.start.x, otherRoad.end.y - otherRoad.start.y))
                                    roadEdge1x = (road.end.x + (Tuple.first <| fromPolar (road.width / 2, roadRot - pi / 2))) * model.renderScale + model.scroll.x
                                    roadEdge1y = (road.end.y + (Tuple.second <| fromPolar (road.width / 2, roadRot - pi / 2))) * model.renderScale + model.scroll.y
                                    otherRoadEdge1x = (otherRoad.start.x + (Tuple.first <| fromPolar (otherRoad.width / 2, otherRoadRot - pi / 2))) * model.renderScale + model.scroll.x
                                    otherRoadEdge1y = (otherRoad.start.y + (Tuple.second <| fromPolar (otherRoad.width / 2, otherRoadRot - pi / 2))) * model.renderScale + model.scroll.y
                                    roadEdge2x = (road.end.x - (Tuple.first <| fromPolar (road.width / 2, roadRot - pi / 2))) * model.renderScale + model.scroll.x
                                    roadEdge2y = (road.end.y - (Tuple.second <| fromPolar (road.width / 2, roadRot - pi / 2))) * model.renderScale + model.scroll.y
                                    otherRoadEdge2x = (otherRoad.start.x - (Tuple.first <| fromPolar (otherRoad.width / 2, otherRoadRot - pi / 2))) * model.renderScale + model.scroll.x
                                    otherRoadEdge2y = (otherRoad.start.y - (Tuple.second <| fromPolar (otherRoad.width / 2, otherRoadRot - pi / 2))) * model.renderScale + model.scroll.y
                                in [ S.polygon
                                        [ Sa.points <| (toString roadEdge1x) ++ " " ++ (toString roadEdge1y)
                                             ++ "," ++ (toString otherRoadEdge1x) ++ " " ++ (toString otherRoadEdge1y)
                                             ++ "," ++ (toString otherRoadEdge2x) ++ " " ++ (toString otherRoadEdge2y)
                                             ++ "," ++ (toString roadEdge2x) ++ " " ++ (toString roadEdge2y)
                                        , Sa.style "fill:gray;stroke:gray;stroke-width:1"
                                        ] []

                                ]
                            Nothing ->
                                []
                    ) road.connectedTo
            ) model.roads

renderRoadLines : Model -> List (S.Svg Msg)
renderRoadLines model =
    List.map (\road ->
            S.line
                [ Sa.x1 <| toString <| road.start.x * model.renderScale + model.scroll.x
                , Sa.y1 <| toString <| road.start.y * model.renderScale + model.scroll.y
                , Sa.x2 <| toString <| road.end.x * model.renderScale + model.scroll.x
                , Sa.y2 <| toString <| road.end.y * model.renderScale + model.scroll.y
                , Sa.strokeWidth <| toString <| model.renderScale / 6
                , Sa.stroke "yellow"
                , Sa.strokeDasharray <| (toString <| model.renderScale / 6) ++ ", " ++ (toString <| model.renderScale / 3)
                ]
                []
        ) model.roads


renderCars : Model -> List (S.Svg Msg)
renderCars model =
    List.map (\car ->
            S.image
              [ Sa.x <| toString <| model.scroll.x + car.pos.x * model.renderScale - carWidth / 2 * model.renderScale
              , Sa.y <| toString <| model.scroll.y + car.pos.y * model.renderScale - carHeight / 2 * model.renderScale
              , Sa.width <| toString <| carWidth * model.renderScale
              , Sa.height <| toString <| carHeight * model.renderScale
              , Sa.xlinkHref <| "Textures/Cars/" ++ getImg car
              , Sa.opacity <| toString car.fade
              , Sa.transform <|
                  "rotate("
                      ++ (toString car.rot)
                      ++ " "
                      ++ (toString <| car.pos.x * model.renderScale + model.scroll.x)
                      ++ " "
                      ++ (toString <| car.pos.y * model.renderScale + model.scroll.y)
                      ++ ")"
              ]
              []

        )
        model.cars


renderTrafficLights : Model -> List (S.Svg Msg)
renderTrafficLights model =
    List.concatMap (\road ->
        case road.trafficLight of
            Just light ->
                let roadDelta = {x = road.end.x - road.start.x, y = road.end.y - road.start.y}
                    roadRotation = (Tuple.second <| toPolar (roadDelta.x, roadDelta.y)) / pi * 180 + 90
                in [S.image
                    [ Sa.x <| toString <| (road.end.x + light.offset.x - 0.5) * model.renderScale + model.scroll.x
                    , Sa.y <| toString <| (road.end.y + light.offset.y - 0.5) * model.renderScale + model.scroll.y
                    , Sa.width <| toString model.renderScale
                    , Sa.height <| toString model.renderScale
                    , Sa.transform <|
                        "rotate(" ++ (toString roadRotation) ++
                              " " ++ (toString <| (road.end.x + light.offset.x) * model.renderScale + model.scroll.x) ++
                              " " ++ (toString <| (road.end.y + light.offset.y) * model.renderScale + model.scroll.y) ++
                              ")"
                    , Sa.xlinkHref <| getTrafficLightPath light
                    ] []
                ]
            Nothing -> []
    ) model.roads


renderBackgroundLines : Model -> List (S.Svg Msg)
renderBackgroundLines model =
    case model.size of
        Just pos ->
            (List.map (\x ->
                    S.line
                        [ Sa.x1 <| toString <| model.renderScale * toFloat x + toFloat (round model.scroll.x % round model.renderScale)
                        , Sa.y1 "0"
                        , Sa.x2 <| toString <| model.renderScale * toFloat x + toFloat (round model.scroll.x % round model.renderScale)
                        , Sa.y2 <| toString <| pos.y
                        , Sa.stroke "black"
                        , Sa.strokeWidth "0.2"
                        ]
                        []
                )
             <|
                List.range 0 <|
                    floor <|
                        pos.x / model.renderScale
            )
                ++ (List.map
                        (\y ->
                            S.line
                                [ Sa.x1 "0"
                                , Sa.y1 <| toString <| model.renderScale * toFloat y + toFloat (round model.scroll.y % round model.renderScale)
                                , Sa.x2 <| toString <| pos.x
                                , Sa.y2 <| toString <| model.renderScale * toFloat y + toFloat (round model.scroll.y % round model.renderScale)
                                , Sa.stroke "black"
                                , Sa.strokeWidth "0.2"
                                ]
                                []
                        )
                    <|
                        List.range 0 <|
                            floor <|
                                pos.y / model.renderScale
                   )

        Nothing ->
            []