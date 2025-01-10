import React, {useEffect, FC, useCallback} from "react";
import {SvgContainer, useSvgContainer, Svg, svgUpdate} from "react-svgdotjs";
import {Director} from "../base/Director";
import {Shape, Polygon, Rectangle, Circle, Ellipse, Dot} from "../base/types";
import Util from "../base/util";
import {AnnotatorHandles} from "./hook";
import "./index.css";
import {Rect, Runner} from "@svgdotjs/svg.js";

let marker: Rect;
let markerAnimation: Runner | null = null;

const ImageAnnotator: FC<ImageAnnotatorProps> = props => {
  const {setHandles, svgContainer} = useSvgContainer();
  const getDirector = () => Director.instance!;

  const drawShapes = (shapes?: Shape[] | any[]) => {
    let director = getDirector();
    if (!shapes) return;
    let rectangles = shapes
      .filter(s => s instanceof Rectangle || s.type === "rectangle")
      .map(s => new Rectangle([...s.points], s.categories, s.color, s.id));
    let polygons = shapes
      .filter(s => s instanceof Polygon || s.type === "polygon")
      .map(s => new Polygon([...s.points], s.categories, s.color));
    let circles = shapes
      .filter(s => s instanceof Circle || s.type === "circle")
      .map(s => new Circle(s.centre, s.radius, s.categories, s.color));
    let ellipses = shapes
      .filter(s => s instanceof Ellipse || s.type === "ellipse")
      .map(s => new Ellipse(s.centre, s.radiusX, s.radiusY, s.categories, s.phi || 0, s.color));
    let dots = shapes
      .filter(s => s instanceof Dot || s.type === "dot")
      .map(s => new Dot(s.position, s.categories, s.color));
    if (rectangles.length > 0) director.plot(rectangles);
    if (polygons.length > 0) director.plot(polygons);
    if (circles.length > 0) director.plot(circles);
    if (ellipses.length > 0) director.plot(ellipses);
    if (dots.length > 0) director.plot(dots);
  };

  let currentZoom: number = 1;

  const zoom = (factor: number, relative: boolean = true) => {
    let director = getDirector();
    factor = director.setSizeAndRatio(factor, relative);
    director.zoom(factor);
    const containerWidth = Number(getDirector().container.style.width.replace("px", ""));
    Object.assign(getDirector().container.style, {
      width: containerWidth * factor + "px"
    });
    currentZoom = factor;
  };

  const stopAll = () => {
    let director = getDirector();
    director.stopDraw();
    director.stopEdit();
  };

  let setMarkerPosition: (position: number) => void = () => null;
  let stopPlayback: () => void;

  const getHandles = () => ({
    drawRectangle() {
      stopAll();
      getDirector().startDraw(new Rectangle());
    },
    drawPolygon() {
      stopAll();
      getDirector().startDraw(new Polygon());
    },
    drawCircle() {
      stopAll();
      getDirector().startDraw(new Circle());
    },
    drawEllipse() {
      stopAll();
      getDirector().startDraw(new Ellipse());
    },
    drawDot() {
      stopAll();
      getDirector().startDraw(new Dot());
    },
    stop: stopAll,
    stopEdit: () => getDirector().stopEdit(),
    edit: (id: number) => getDirector().edit(id),
    delete: (id: number) => getDirector().removeById(id),
    updateCategories: (id: number, categories: string[], color?: string) =>
      getDirector().updateCategories(id, categories, color),
    zoom,
    getShapes: getDirector().getShapes,
    setMarkerPosition,
    stopPlayback
  });

  const onload = React.useCallback(
    (svg: Svg, container: HTMLDivElement, imageUrl: string) => {
      let onloaded = (ev: any) => {
        if (!ev?.target || !svg.node.innerHTML) return;
        let target = ev!.detail?.testRil || ev!.target,
          src1 = container.getAttribute("data-img")!,
          src2 = imageUrl;
        if (src1 !== Util.fileName(src2)) {
          for (let i = 0; i < svg.node.children.length; i++) {
            let child = svg.node.children[i],
              href = Util.fileName(child.getAttribute("href"));
            if (href && src1 !== href) child.remove();
          }
          return;
        }
        let naturalWidth = target.naturalWidth,
          naturalHeight = target.naturalHeight,
          maxWidth = props.width,
          maxHeight = props.height, 
          ratio = 1;
        svg.addClass("il-svg");
        Object.assign(container.style, {
          width: (props.width || naturalWidth) + "px",
          height: (props.height || naturalHeight) + "px",
          overflow: "hidden",
          backgroundColor: "#e6e6e6"
        });
        if (!props.naturalSize) {
          if (!maxWidth) maxWidth = container.scrollWidth;
          if (!maxHeight) maxHeight = container.scrollHeight;
          if (maxWidth! / maxHeight! > target.naturalWidth / target.naturalHeight)
            ratio = Math.min(maxHeight!, target.naturalHeight) / naturalHeight;
          else ratio = Math.min(maxWidth!, target.naturalWidth) / naturalWidth;
        }
        let statics = {
          width: naturalWidth,
          height: naturalHeight * (props.heightZoom ?? 1),
          ratio,
          discRadius: props.discRadius || 5,
          hb: props.hideBorder
        };
        Director.init(svg, statics, container);
        drawShapes(props.shapes);
        props.setHandles({...getHandles(), container});
        props.onReady?.({...getHandles(), container});
        window.scrollTo(0, 0);
      };

      container.setAttribute("data-img", Util.fileName(imageUrl));

      var image = svg
        .image(imageUrl, onloaded)
        .size("100%", "100%")
        .attr("onmousedown", "return false")
        .attr("oncontextmenu", "return false")
        .attr("preserveAspectRatio", "none");

      image.node.addEventListener("testEvent", onloaded);

      stopPlayback = () => {
        marker?.remove();
        markerAnimation?.timeline()?.stop();
      };
    },
    [props.width, props.height, props.shapes, props.duration]
  );

  useEffect(() => {
    Director.setActions(props.onAdded, props.onContextMenu, props.onSelected, props.onUpdated);
    return () => Director.setActions(undefined, undefined);
  }, [props.onAdded, props.onContextMenu, props.onSelected, props.onUpdated]);

  useEffect(() => {
    const onblur = () => svgContainer!.container.classList.remove("grabbable");
    const onkeydown = (e: KeyboardEvent) => e.key === "Control" && svgContainer!.container.classList.add("grabbable");
    const keyup = (e: KeyboardEvent) => {
      if (e.key === "Control") onblur();
      if (e.key === "Delete") Director.instance?.remove();
      if (e.key === "Escape") Director.instance?.stopEdit();
    };
    if (svgContainer && props.imageUrl) {
      onload(svgContainer.svg, svgContainer.container, props.imageUrl);
      window.addEventListener("keydown", onkeydown);
      window.addEventListener("keyup", keyup);
      window.addEventListener("blur", onblur);
    }
    return () => {
      Director.instance?.clear();
      window.removeEventListener("keydown", onkeydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", onblur);
    };
  }, [svgContainer, props.imageUrl]);

  // PLAYBACK POSITION (RIGHT CLICK) HANDLER
  useEffect(() => {
    const contextmenu = (e: MouseEvent) => {
      marker?.remove();

      const totalWidth = Math.floor(svgContainer!.container.scrollWidth ?? 0);
      const position = e.offsetX / totalWidth;
      const remainingTime = props.duration - props.duration * position;

      marker = svgContainer!.svg.rect(10, 512).fill("#ff00ff80");
      marker.move(e.offsetX, 0);

      markerAnimation = marker
        .animate(remainingTime * 1000, 0)
        .ease("-")
        .move(totalWidth, 0);

      markerAnimation.during(() => {
        marker.node.scrollIntoView();
      });

      props.onRightClick?.(position);
    };
    if (svgContainer && props.imageUrl) {
      window.addEventListener("contextmenu", contextmenu);
    }
    return () => {
      window.removeEventListener("contextmenu", contextmenu);
    };
  }, [svgContainer, setMarkerPosition]);

  return <SvgContainer setHandles={setHandles} />;
};

export {ImageAnnotator};

export interface ImageAnnotatorProps {
  onReady?: (annotator: AnnotatorHandles) => any;
  onAdded?: (shape: Shape) => any;
  onSelected?: (shape: Shape) => any;
  onContextMenu?: (shape: Shape) => any;
  onRightClick?: (position: number) => void;
  onUpdated?: () => void;
  imageUrl?: string;
  shapes?: Shape[] | any[];
  naturalSize?: boolean;
  width?: number;
  height?: number;
  heightZoom?: number;
  discRadius?: number;
  hideBorder?: boolean;
  setHandles: (handles: AnnotatorHandles) => void;
  duration: number;
}
